import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAuthUser, hasRole } from '@/lib/auth';
import { transaction, queryOne } from '@/lib/db';
import { sendEmergencyFollowupEmail } from '@/lib/notifications';
import {
  calculateArrivalDeadline,
  calculateEstimatedArrival,
  canAccessEmergencyAppointment,
  formatMySqlDateTime,
  getAmbulanceEtaMinutes,
  parseMySqlDateTime,
  resolveEmergencyFollowupAction,
} from '@/lib/emergencyFollowup';
import { badRequest, conflict, forbidden, notFound, ok, serverError, unauthorized } from '@/lib/response';

const choiceSchema = z.object({ ambulance_requested: z.boolean() });

type FollowupRow = {
  followup_id: number;
  appointment_id: number;
  ambulance_requested: number;
  ambulance_status: 'Requested' | 'NotRequested';
  requested_at: string;
  estimated_arrival_at: string | null;
  arrival_deadline_at: string | null;
  dispatch_provider: string;
  dispatch_details: string | Record<string, unknown> | null;
  email_status: 'Sending' | 'Sent' | 'Failed';
  email_attempts: number;
  notification_id: number;
};

type AppointmentRow = {
  appointment_id: number;
  patient_id: number;
  owner_user_id: number;
  is_emergency: number;
  created_at: Date | string;
  appointment_datetime: Date | string;
  facility_type: 'Hospital' | 'Clinic';
  patient_name: string;
  patient_email: string;
  doctor_name: string;
  facility_name: string;
  facility_address: string;
  facility_city: string;
  facility_phone: string | null;
  facility_email: string | null;
};

type FollowupResult = {
  appointment: AppointmentRow;
  followup: FollowupRow;
  shouldSendEmail: boolean;
};

type FollowupTransactionResult =
  | { failure: 'notFound' | 'notEmergency' | 'conflict' }
  | { failure: 'processing'; appointment: AppointmentRow; followup: FollowupRow }
  | FollowupResult;

function publicFollowup(row: FollowupRow) {
  return {
    ambulanceRequested: Boolean(row.ambulance_requested),
    ambulanceStatus: row.ambulance_status,
    requestedAt: row.requested_at,
    estimatedArrivalAt: row.estimated_arrival_at,
    arrivalDeadlineAt: row.arrival_deadline_at,
    dispatchProvider: row.dispatch_provider,
    emailStatus: row.email_status,
  };
}

function parseAppointmentId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

async function getOwnedEmergencyAppointment(appointmentId: number, userId: number) {
  return queryOne<AppointmentRow>(
    `SELECT a.appointment_id, a.patient_id, p.user_id AS owner_user_id, a.is_emergency, a.created_at,
            a.appointment_datetime, a.facility_type, pu.full_name AS patient_name, pu.email AS patient_email,
            du.full_name AS doctor_name, COALESCE(h.name, cl.name) AS facility_name,
            COALESCE(h.address_line1, cl.address_line1, '') AS facility_address,
            COALESCE(h.city, cl.city, '') AS facility_city, COALESCE(h.phone, cl.phone) AS facility_phone,
            COALESCE(h.email, cl.email) AS facility_email
       FROM appointments a
       JOIN patients p ON p.patient_id = a.patient_id
       JOIN users pu ON pu.user_id = p.user_id
       JOIN doctors d ON d.doctor_id = a.doctor_id
       JOIN users du ON du.user_id = d.user_id
       LEFT JOIN hospitals h ON h.hospital_id = a.hospital_id AND a.facility_type = 'Hospital'
       LEFT JOIN clinics cl ON cl.clinic_id = a.clinic_id AND a.facility_type = 'Clinic'
      WHERE a.appointment_id = ? AND p.user_id = ?`,
    [appointmentId, userId]
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Patient')) return forbidden();

  const appointmentId = parseAppointmentId((await params).id);
  if (!appointmentId) return badRequest('Invalid appointment ID');

  try {
    const appointment = await getOwnedEmergencyAppointment(appointmentId, user.userId);
    if (!appointment) return notFound();
    if (!canAccessEmergencyAppointment({
      roles: user.roles,
      userId: user.userId,
      ownerUserId: appointment.owner_user_id,
      isEmergency: Boolean(appointment.is_emergency),
    })) return forbidden('This is not an emergency appointment');

    const followup = await queryOne<FollowupRow>(
      'SELECT * FROM appointment_emergency_followups WHERE appointment_id = ?',
      [appointmentId]
    );
    return ok(followup ? publicFollowup(followup) : null);
  } catch (err) {
    console.error('[Emergency follow-up GET] database operation failed', {
      code: (err as { code?: string }).code,
    });
    return serverError();
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Patient')) return forbidden();

  const appointmentId = parseAppointmentId((await params).id);
  if (!appointmentId) return badRequest('Invalid appointment ID');

  const body = await request.json().catch(() => null);
  const parsed = choiceSchema.safeParse(body);
  if (!parsed.success) return badRequest('Choose Yes or No for ambulance assistance');

  let etaMinutes: number;
  try {
    etaMinutes = getAmbulanceEtaMinutes(process.env.AMBULANCE_ESTIMATED_ARRIVAL_MINUTES);
  } catch {
    console.error('[Emergency follow-up] invalid ambulance estimate configuration');
    return serverError('The ambulance estimate is temporarily unavailable');
  }

  let followupResult: FollowupResult | null = null;
  let failure: 'notFound' | 'notEmergency' | 'conflict' | 'processing' | null = null;

  try {
    const transactionResult = await transaction<FollowupTransactionResult>(async (conn) => {
      const [appointments] = await conn.execute(
        `SELECT a.appointment_id, a.patient_id, p.user_id AS owner_user_id, a.is_emergency, a.created_at,
                a.appointment_datetime, a.facility_type, pu.full_name AS patient_name, pu.email AS patient_email,
                du.full_name AS doctor_name, COALESCE(h.name, cl.name) AS facility_name,
                COALESCE(h.address_line1, cl.address_line1, '') AS facility_address,
                COALESCE(h.city, cl.city, '') AS facility_city, COALESCE(h.phone, cl.phone) AS facility_phone,
                COALESCE(h.email, cl.email) AS facility_email
           FROM appointments a
           JOIN patients p ON p.patient_id = a.patient_id
           JOIN users pu ON pu.user_id = p.user_id
           JOIN doctors d ON d.doctor_id = a.doctor_id
           JOIN users du ON du.user_id = d.user_id
           LEFT JOIN hospitals h ON h.hospital_id = a.hospital_id AND a.facility_type = 'Hospital'
           LEFT JOIN clinics cl ON cl.clinic_id = a.clinic_id AND a.facility_type = 'Clinic'
          WHERE a.appointment_id = ? AND p.user_id = ? FOR UPDATE`,
        [appointmentId, user.userId]
      );
      const appointment = (appointments as AppointmentRow[])[0];
      if (!appointment) return { failure: 'notFound' as const };
      if (!canAccessEmergencyAppointment({
        roles: user.roles,
        userId: user.userId,
        ownerUserId: appointment.owner_user_id,
        isEmergency: Boolean(appointment.is_emergency),
      })) return { failure: 'notEmergency' as const };

      const [existingRows] = await conn.execute(
        'SELECT * FROM appointment_emergency_followups WHERE appointment_id = ? FOR UPDATE',
        [appointmentId]
      );
      const existing = (existingRows as FollowupRow[])[0] ?? null;
      const action = resolveEmergencyFollowupAction(
        existing ? { ...existing, ambulance_requested: Boolean(existing.ambulance_requested) } : null,
        parsed.data.ambulance_requested
      );
      if (action === 'conflict') return { failure: 'conflict' as const };
      if (action === 'processing') return { failure: 'processing' as const, appointment, followup: existing };
      if (action === 'existing') return { appointment, followup: existing, shouldSendEmail: false };

      const requestedAt = formatMySqlDateTime(new Date());
      const etaAt = parsed.data.ambulance_requested
        ? formatMySqlDateTime(calculateEstimatedArrival(new Date(), etaMinutes))
        : null;
      const arrivalDeadlineAt = parsed.data.ambulance_requested
        ? null
        : formatMySqlDateTime(calculateArrivalDeadline(appointment.created_at instanceof Date
          ? appointment.created_at
          : parseMySqlDateTime(appointment.created_at)));
      const effectiveRequestedAt = existing?.requested_at ?? requestedAt;
      const effectiveEtaAt = existing?.estimated_arrival_at ?? etaAt;
      const effectiveDeadlineAt = existing?.arrival_deadline_at ?? arrivalDeadlineAt;
      const ambulanceStatus = parsed.data.ambulance_requested ? 'Requested' : 'NotRequested';
      const dispatchProvider = parsed.data.ambulance_requested ? 'estimate_only' : 'none';
      const dispatchDetails = JSON.stringify(parsed.data.ambulance_requested
        ? { provider: 'estimate_only', dispatchStatus: 'not_dispatched', note: 'No real-time dispatch provider is connected.' }
        : { provider: 'none', dispatchStatus: 'not_requested' });
      const notificationMessage = parsed.data.ambulance_requested
        ? `Ambulance request recorded for APT-${appointmentId}; estimated arrival ${etaAt}.`
        : `Emergency arrival deadline for APT-${appointmentId}: ${arrivalDeadlineAt}.`;

      let followupId: number;
      let notificationId: number;
      if (existing) {
        await conn.execute(
          `UPDATE appointment_emergency_followups
              SET email_status = 'Sending', email_attempts = email_attempts + 1, email_error = NULL
            WHERE followup_id = ?`,
          [existing.followup_id]
        );
        const [notificationRows] = await conn.execute(
          `SELECT notification_id FROM notifications
            WHERE notification_id = ? AND user_id = ? FOR UPDATE`,
          [existing.notification_id, user.userId]
        );
        if ((notificationRows as { notification_id: number }[]).length !== 1) {
          throw new Error('Emergency follow-up notification record is missing');
        }
        await conn.execute(
          'UPDATE notifications SET sent_at = NULL WHERE notification_id = ? AND user_id = ?',
          [existing.notification_id, user.userId]
        );
        followupId = existing.followup_id;
        notificationId = existing.notification_id;
      } else {
        const [notificationResult] = await conn.execute(
          `INSERT INTO notifications (user_id, type, title, message, sent_at)
           VALUES (?, 'Email', ?, ?, NULL)`,
          [
            user.userId,
            parsed.data.ambulance_requested ? 'Ambulance request recorded' : 'Emergency arrival deadline',
            notificationMessage,
          ]
        );
        notificationId = (notificationResult as { insertId: number }).insertId;

        const [followupInsert] = await conn.execute(
          `INSERT INTO appointment_emergency_followups
             (appointment_id, patient_id, ambulance_requested, ambulance_status, requested_at,
              estimated_arrival_at, arrival_deadline_at, dispatch_provider, dispatch_details,
              email_status, email_attempts, notification_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Sending', 1, ?)`,
          [
            appointmentId, appointment.patient_id, parsed.data.ambulance_requested ? 1 : 0,
            ambulanceStatus, effectiveRequestedAt, effectiveEtaAt, effectiveDeadlineAt, dispatchProvider, dispatchDetails,
            notificationId,
          ]
        );
        followupId = (followupInsert as { insertId: number }).insertId;
      }

      const followup: FollowupRow = {
        followup_id: followupId,
        appointment_id: appointmentId,
        ambulance_requested: parsed.data.ambulance_requested ? 1 : 0,
        ambulance_status: ambulanceStatus,
        requested_at: effectiveRequestedAt,
        estimated_arrival_at: effectiveEtaAt,
        arrival_deadline_at: effectiveDeadlineAt,
        dispatch_provider: dispatchProvider,
        dispatch_details: dispatchDetails,
        email_status: 'Sending',
        email_attempts: existing ? existing.email_attempts + 1 : 1,
        notification_id: notificationId,
      };
      return { appointment, followup, shouldSendEmail: true };
    });

    if ('failure' in transactionResult) {
      failure = transactionResult.failure;
      if ('appointment' in transactionResult && 'followup' in transactionResult) {
        followupResult = {
          appointment: transactionResult.appointment,
          followup: transactionResult.followup,
          shouldSendEmail: false,
        };
      }
    } else {
      followupResult = transactionResult;
    }
  } catch (err) {
    console.error('[Emergency follow-up POST] database transaction failed', {
      code: (err as { code?: string }).code,
    });
    return serverError();
  }

  if (failure === 'notFound') return notFound();
  if (failure === 'notEmergency') return forbidden('This is not an emergency appointment');
  if (failure === 'conflict') return conflict('A different emergency arrival choice has already been recorded');
  if (failure === 'processing') {
    return Response.json({ success: true, data: publicFollowup(followupResult!.followup) }, { status: 202 });
  }
  if (!followupResult) return serverError();
  if (!followupResult.shouldSendEmail) return ok(publicFollowup(followupResult.followup));

  const { appointment, followup } = followupResult;
  let emailSent = false;
  try {
    emailSent = await sendEmergencyFollowupEmail(appointment.patient_email, {
      choice: parsed.data.ambulance_requested ? 'ambulance' : 'self-arrival',
      appointmentId,
      patientName: appointment.patient_name,
      doctorName: appointment.doctor_name,
      facilityName: appointment.facility_name,
      facilityType: appointment.facility_type,
      facilityAddress: appointment.facility_address,
      facilityCity: appointment.facility_city,
      facilityPhone: appointment.facility_phone,
      facilityEmail: appointment.facility_email,
      appointmentDateTime: typeof appointment.appointment_datetime === 'string'
        ? appointment.appointment_datetime
        : formatMySqlDateTime(appointment.appointment_datetime),
      estimatedArrivalAt: followup.estimated_arrival_at ?? undefined,
      arrivalDeadlineAt: followup.arrival_deadline_at ?? undefined,
    });
  } catch {
    emailSent = false;
  }

  try {
    await transaction(async (conn) => {
      const [followupUpdate] = await conn.execute(
        `UPDATE appointment_emergency_followups
            SET email_status = ?, email_error = ?, email_sent_at = ?
          WHERE followup_id = ?`,
        [
          emailSent ? 'Sent' : 'Failed',
          emailSent ? null : 'Email provider did not confirm delivery',
          emailSent ? formatMySqlDateTime(new Date()) : null,
          followup.followup_id,
        ]
      );
      const [notificationRows] = await conn.execute(
        `SELECT notification_id FROM notifications
          WHERE notification_id = ? AND user_id = ? FOR UPDATE`,
        [followup.notification_id, user.userId]
      );
      if ((notificationRows as { notification_id: number }[]).length !== 1) {
        throw new Error('Emergency follow-up notification record is missing');
      }
      await conn.execute(
        `UPDATE notifications SET sent_at = ?
          WHERE notification_id = ? AND user_id = ?`,
        [
          emailSent ? formatMySqlDateTime(new Date()) : null,
          followup.notification_id,
          user.userId,
        ]
      );
      if ((followupUpdate as { affectedRows: number }).affectedRows !== 1) {
        throw new Error('Emergency follow-up email status could not be saved');
      }
    });
  } catch (err) {
    console.error('[Emergency follow-up POST] email status update failed', {
      code: (err as { code?: string }).code,
    });
    return serverError('The request was recorded, but its email status could not be updated. Retry to safely check the request status.');
  }

  const response = {
    ...publicFollowup(followup),
    emailStatus: emailSent ? 'Sent' : 'Failed',
  };
  if (!emailSent) {
    return Response.json(
      { success: false, data: response, error: 'Your choice was recorded, but the email could not be sent. Retry to try sending it again.' },
      { status: 502 }
    );
  }
  return ok(response, 'Emergency follow-up recorded and email sent');
}
