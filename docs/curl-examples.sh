#!/usr/bin/env bash
# Hospital Queue Management System — API curl examples
# Prerequisites: curl, jq
# Usage: bash docs/curl-examples.sh
# Or run individual commands manually.

BASE="http://localhost:3000"

echo "=========================================="
echo "  Hospital Queue API — curl examples"
echo "=========================================="

# ──────────────────────────────────────────────
# AUTH
# ──────────────────────────────────────────────

echo ""
echo "--- 1. Register a Patient ---"
curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "patient@example.co.za",
    "password": "Test@12345",
    "first_name": "Thabo",
    "last_name": "Dlamini",
    "id_number": "9001015009087",
    "phone_number": "0821234567",
    "role": "Patient",
    "blood_type": "O+",
    "medical_aid_provider": "Discovery",
    "medical_aid_number": "12345678",
    "emergency_contact_name": "Nomsa Dlamini",
    "emergency_contact_phone": "0831234567"
  }' | jq .

echo ""
echo "--- 2. Register a Doctor ---"
curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "doctor@example.co.za",
    "password": "Test@12345",
    "first_name": "Sipho",
    "last_name": "Nkosi",
    "id_number": "7501015009087",
    "phone_number": "0831234567",
    "role": "Doctor",
    "hpcsa_number": "MP1234567",
    "specialization_id": 1,
    "consultation_fee": 850,
    "years_of_experience": 12,
    "bio": "Specialist in General Practice with 12 years of experience."
  }' | jq .

echo ""
echo "--- 3. Login as Patient ---"
LOGIN_RESPONSE=$(curl -s -c cookies.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"patient@example.co.za","password":"Test@12345"}')
echo "$LOGIN_RESPONSE" | jq .

# Extract access token for subsequent requests
ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.accessToken')
echo "Access token: ${ACCESS_TOKEN:0:30}..."

echo ""
echo "--- 4. Get current user profile ---"
curl -s "$BASE/api/auth/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

echo ""
echo "--- 5. Refresh access token ---"
curl -s -b cookies.txt -c cookies.txt -X POST "$BASE/api/auth/refresh" | jq .

echo ""
echo "--- 6. Logout ---"
curl -s -b cookies.txt -X POST "$BASE/api/auth/logout" | jq .

# ──────────────────────────────────────────────
# DOCTORS
# ──────────────────────────────────────────────

echo ""
echo "--- 7. List doctors (with filters) ---"
curl -s "$BASE/api/doctors?province=Gauteng&facility_type=Hospital&limit=5" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.data[:2]'

echo ""
echo "--- 8. Search doctors by name ---"
curl -s "$BASE/api/doctors?search=Nkosi&limit=5" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

echo ""
echo "--- 9. Get a specific doctor ---"
curl -s "$BASE/api/doctors/1" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

# ──────────────────────────────────────────────
# APPOINTMENTS
# ──────────────────────────────────────────────

echo ""
echo "--- 10. Book an appointment ---"
curl -s -X POST "$BASE/api/appointments" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "doctor_id": 1,
    "facility_type": "Hospital",
    "facility_id": 1,
    "appointment_datetime": "2026-06-15T09:00:00",
    "reason_for_visit": "Routine checkup"
  }' | jq .

echo ""
echo "--- 11. List my appointments ---"
curl -s "$BASE/api/appointments" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

echo ""
echo "--- 12. Cancel an appointment ---"
curl -s -X PATCH "$BASE/api/appointments/1" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"Cancelled"}' | jq .

# ──────────────────────────────────────────────
# QUEUE
# ──────────────────────────────────────────────

# Login as receptionist for queue management
echo ""
echo "--- 13. Login as Receptionist ---"
RECEPT_TOKEN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"receptionist@example.co.za","password":"Test@12345"}' \
  | jq -r '.data.accessToken')

echo ""
echo "--- 14. Get today's queue for a doctor ---"
curl -s "$BASE/api/queue?doctor_id=1&date=$(date +%Y-%m-%d)" \
  -H "Authorization: Bearer $RECEPT_TOKEN" | jq .

echo ""
echo "--- 15. Add walk-in patient to queue ---"
curl -s -X POST "$BASE/api/queue" \
  -H "Authorization: Bearer $RECEPT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "appointment_id": 1,
    "doctor_id": 1,
    "date": "2026-06-15"
  }' | jq .

echo ""
echo "--- 16. Call next patient (set In-Progress) ---"
curl -s -X PATCH "$BASE/api/queue/1" \
  -H "Authorization: Bearer $RECEPT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"call"}' | jq .

echo ""
echo "--- 17. Mark patient as completed ---"
curl -s -X PATCH "$BASE/api/queue/1" \
  -H "Authorization: Bearer $RECEPT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"complete"}' | jq .

echo ""
echo "--- 18. Mark patient as No-Show ---"
curl -s -X PATCH "$BASE/api/queue/2" \
  -H "Authorization: Bearer $RECEPT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"no-show"}' | jq .

echo ""
echo "--- 19. Skip a patient (move to end) ---"
curl -s -X PATCH "$BASE/api/queue/3" \
  -H "Authorization: Bearer $RECEPT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"skip"}' | jq .

echo ""
echo "--- 20. SSE stream (live queue updates) — runs for 10 seconds ---"
echo "  (Press Ctrl+C to stop early)"
timeout 10 curl -s -N "$BASE/api/queue/sse?doctor_id=1&date=$(date +%Y-%m-%d)" \
  -H "Authorization: Bearer $RECEPT_TOKEN"

# ──────────────────────────────────────────────
# HOSPITALS & CLINICS
# ──────────────────────────────────────────────

echo ""
echo ""
echo "--- 21. List hospitals ---"
curl -s "$BASE/api/hospitals?province=Gauteng&limit=5" | jq '.data[:2]'

echo ""
echo "--- 22. Create a hospital (Admin only) ---"
ADMIN_TOKEN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hospital.co.za","password":"Admin@12345"}' \
  | jq -r '.data.accessToken')

curl -s -X POST "$BASE/api/hospitals" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Johannesburg General Hospital",
    "address": "1 Jan Smuts Ave",
    "city": "Johannesburg",
    "province": "Gauteng",
    "postal_code": "2001",
    "phone_number": "0115551234",
    "email": "info@jhbgeneral.co.za",
    "hospital_type": "Public",
    "bed_count": 500
  }' | jq .

echo ""
echo "--- 23. List clinics ---"
curl -s "$BASE/api/clinics?province=Western+Cape&limit=5" | jq '.data[:2]'

# ──────────────────────────────────────────────
# SPECIALIZATIONS
# ──────────────────────────────────────────────

echo ""
echo "--- 24. List specializations ---"
curl -s "$BASE/api/specializations" | jq .

echo ""
echo "--- 25. Create specialization (Admin only) ---"
curl -s -X POST "$BASE/api/specializations" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"General Practice","description":"Primary care and general medicine"}' | jq .

# ──────────────────────────────────────────────
# TIME SLOTS
# ──────────────────────────────────────────────

echo ""
echo "--- 26. Get available time slots ---"
curl -s "$BASE/api/time-slots?doctor_id=1&facility_type=Hospital&facility_id=1" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

# Login as doctor to create time slots
DOCTOR_TOKEN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"doctor@example.co.za","password":"Test@12345"}' \
  | jq -r '.data.accessToken')

echo ""
echo "--- 27. Create time slots (Doctor only) ---"
curl -s -X POST "$BASE/api/time-slots" \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "facility_type": "Hospital",
    "facility_id": 1,
    "slot_date": "2026-06-15",
    "start_time": "09:00",
    "end_time": "09:30",
    "max_appointments": 1
  }' | jq .

# ──────────────────────────────────────────────
# REVIEWS
# ──────────────────────────────────────────────

echo ""
echo "--- 28. Submit a review ---"
curl -s -X POST "$BASE/api/reviews" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "doctor_id": 1,
    "appointment_id": 1,
    "rating": 5,
    "comment": "Excellent doctor, very thorough and professional."
  }' | jq .

echo ""
echo "--- 29. Get reviews for a doctor ---"
curl -s "$BASE/api/reviews?doctor_id=1" | jq .

# ──────────────────────────────────────────────
# MEDICAL HISTORY
# ──────────────────────────────────────────────

echo ""
echo "--- 30. Get my medical history ---"
curl -s "$BASE/api/medical-history" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

echo ""
echo "--- 31. Add medical history entry (Doctor only) ---"
curl -s -X POST "$BASE/api/medical-history" \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "patient_id": 1,
    "appointment_id": 1,
    "diagnosis": "Hypertension Stage 1",
    "treatment": "Lifestyle modification, low-sodium diet",
    "medications": "Amlodipine 5mg daily",
    "notes": "Follow up in 3 months",
    "is_chronic": true
  }' | jq .

# ──────────────────────────────────────────────
# NOTIFICATIONS
# ──────────────────────────────────────────────

echo ""
echo "--- 32. Get my notifications ---"
curl -s "$BASE/api/notifications?unread_only=true" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

# ──────────────────────────────────────────────
# AI ENDPOINTS
# ──────────────────────────────────────────────

echo ""
echo "--- 33. Symptom checker ---"
curl -s -X POST "$BASE/api/ai/symptom-check" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "symptoms": ["headache", "fever", "fatigue", "body aches"],
    "age": 35,
    "gender": "Male"
  }' | jq .

echo ""
echo "--- 34. Predict wait time ---"
curl -s "$BASE/api/ai/predict-wait-time?doctor_id=1&date=$(date +%Y-%m-%d)" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

echo ""
echo "--- 35. Predict no-show probability ---"
curl -s -X POST "$BASE/api/ai/predict-no-show" \
  -H "Authorization: Bearer $DOCTOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"appointment_id": 1}' | jq .

# ──────────────────────────────────────────────
# ADMIN
# ──────────────────────────────────────────────

echo ""
echo "--- 36. Admin analytics ---"
curl -s "$BASE/api/admin/analytics" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

echo ""
echo "--- 37. List all users (Admin only) ---"
curl -s "$BASE/api/admin/users?role=Doctor&limit=10" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .

echo ""
echo "--- 38. Assign doctor to hospital (Admin only) ---"
curl -s -X POST "$BASE/api/admin/assign-doctor" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "doctor_id": 1,
    "facility_type": "Hospital",
    "facility_id": 1
  }' | jq .

echo ""
echo "--- 39. Deactivate a user (Admin only) ---"
curl -s -X PATCH "$BASE/api/admin/users/2" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_active": false}' | jq .

echo ""
echo "=========================================="
echo "  All examples complete"
echo "=========================================="

# Clean up cookies file
rm -f cookies.txt
