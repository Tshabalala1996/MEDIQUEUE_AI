'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueueSocket } from '@/hooks/useSocket';

interface QueueItem {
  id: number;
  queue_position: number;
  patient_name: string;
  status: 'Waiting' | 'In-Progress' | 'Completed' | 'No-Show' | 'Skipped';
  appointment_datetime: string;
  estimated_wait_minutes: number | null;
  called_at: string | null;
}

export function QueueBoardInner() {
  const searchParams = useSearchParams();
  const doctorId = searchParams.get('doctor_id') ?? '';
  const facilityName = searchParams.get('facility') ?? 'MediQueue AI Healthcare';

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [displayDate, setDisplayDate] = useState(new Date().toISOString().slice(0, 10));
  const [tick, setTick] = useState(false);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
      setCurrentDate(now.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
      setTick((t) => !t);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const fetchQueue = useCallback(async () => {
    const params = new URLSearchParams({ date: displayDate });
    if (doctorId) params.set('doctor_id', doctorId);
    const res = await fetch(`/api/queue/public?${params}`).catch(() => null);
    if (res?.ok) {
      const d = await res.json();
      setQueue(d.data ?? []);
      setLastUpdated(new Date());
    }
  }, [doctorId, displayDate]);

  // Socket.io real-time connection
  const connected = useQueueSocket(doctorId, displayDate, fetchQueue);

  // Initial fetch + 30-second fallback poll
  useEffect(() => {
    fetchQueue();
    const pollId = setInterval(fetchQueue, 30_000);
    return () => clearInterval(pollId);
  }, [fetchQueue]);

  const serving = queue.find((q) => q.status === 'In-Progress');
  const waiting = queue.filter((q) => q.status === 'Waiting').slice(0, 6);
  const totalWaiting = queue.filter((q) => q.status === 'Waiting').length;

  return (
    <div className="min-h-screen flex flex-col" style={{
      background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1b3e 50%, #0a1628 100%)',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>

      {/* Header */}
      <header style={{
        background: 'linear-gradient(90deg, #1a237e 0%, #0d47a1 50%, #01579b 100%)',
        borderBottom: '3px solid #2979ff',
        padding: '0 2.5rem',
        height: '80px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 4px 30px rgba(41, 121, 255, 0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: '48px', height: '48px',
            background: 'linear-gradient(135deg, #2979ff, #00b0ff)',
            borderRadius: '12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '24px', boxShadow: '0 4px 15px rgba(41,121,255,0.5)',
          }}>✚</div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', letterSpacing: '0.05em' }}>{facilityName}</div>
            <div style={{ fontSize: '0.75rem', color: '#90caf9', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Live Queue Display</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          {/* Date picker */}
          <input
            type="date"
            value={displayDate}
            onChange={(e) => setDisplayDate(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px', padding: '6px 12px', color: '#fff', fontSize: '0.85rem',
            }}
          />
          {doctorId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: connected ? '#00e676' : '#ff1744',
                boxShadow: connected ? '0 0 8px #00e676' : '0 0 8px #ff1744',
                animation: connected ? 'pulse 2s infinite' : 'none',
              }} />
              <span style={{ color: connected ? '#00e676' : '#ff1744', fontSize: '0.8rem', fontWeight: 600 }}>
                {connected ? 'LIVE' : 'RECONNECTING'}
              </span>
            </div>
          )}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', letterSpacing: '0.05em', fontVariantNumeric: 'tabular-nums' }}>
              {currentTime.split(':').map((part, i) => (
                <span key={i}>{i > 0 ? <span style={{ opacity: tick ? 1 : 0.3, transition: 'opacity 0.1s' }}>:</span> : ''}{part}</span>
              ))}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#90caf9', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{currentDate}</div>
          </div>
        </div>
      </header>

      <main style={{ flex: 1, padding: '2rem 2.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

        {/* NOW SERVING */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ width: '4px', height: '24px', background: '#2979ff', borderRadius: '2px' }} />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.2em', color: '#90caf9', textTransform: 'uppercase' }}>
              Now Serving
            </span>
          </div>

          {serving ? (
            <div style={{
              background: 'linear-gradient(135deg, rgba(41,121,255,0.15) 0%, rgba(0,176,255,0.1) 100%)',
              border: '1px solid rgba(41,121,255,0.4)',
              borderRadius: '20px',
              padding: '2rem 2.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '2rem',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 0 40px rgba(41,121,255,0.15), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}>
              <div style={{
                position: 'absolute', top: '-50%', left: '30%', width: '400px', height: '400px',
                background: 'radial-gradient(circle, rgba(41,121,255,0.12) 0%, transparent 70%)',
                pointerEvents: 'none',
              }} />

              <div style={{
                width: '110px', height: '110px', flexShrink: 0,
                background: 'linear-gradient(135deg, #2979ff, #00b0ff)',
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
                boxShadow: '0 0 30px rgba(41,121,255,0.6)',
              }}>
                <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.8)', letterSpacing: '0.1em', fontWeight: 600 }}>TICKET</span>
                <span style={{ fontSize: '2.2rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>#{serving.queue_position}</span>
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '3rem', fontWeight: 900, color: '#fff', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                  {serving.patient_name}
                </div>
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                  <span style={{
                    background: 'rgba(0,230,118,0.15)', border: '1px solid rgba(0,230,118,0.4)',
                    color: '#00e676', borderRadius: '100px', padding: '4px 16px',
                    fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.1em',
                  }}>
                    ● IN CONSULTATION
                  </span>
                  {serving.called_at && (
                    <span style={{ color: '#90caf9', fontSize: '0.85rem' }}>
                      Called at {new Date(serving.called_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <div style={{ marginTop: '0.75rem', color: '#64b5f6', fontSize: '1rem', fontWeight: 500 }}>
                  Please proceed to the consultation room →
                </div>
              </div>

              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                {[0,1,2].map((i) => (
                  <div key={i} style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: '#2979ff',
                    opacity: tick === (i % 2 === 0) ? 1 : 0.2,
                    transition: 'opacity 0.5s',
                    boxShadow: '0 0 8px #2979ff',
                  }} />
                ))}
              </div>
            </div>
          ) : (
            <div style={{
              border: '2px dashed rgba(41,121,255,0.2)',
              borderRadius: '20px',
              padding: '3rem',
              textAlign: 'center',
              color: 'rgba(255,255,255,0.2)',
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🏥</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>No patient currently being served</div>
            </div>
          )}
        </section>

        {/* NEXT IN QUEUE */}
        <section style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '4px', height: '24px', background: '#ffd740', borderRadius: '2px' }} />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.2em', color: '#90caf9', textTransform: 'uppercase' }}>
                Next in Queue
              </span>
            </div>
            <div style={{
              background: 'rgba(255,215,64,0.15)', border: '1px solid rgba(255,215,64,0.3)',
              borderRadius: '100px', padding: '4px 16px',
              color: '#ffd740', fontSize: '0.8rem', fontWeight: 700,
            }}>
              {totalWaiting} WAITING
            </div>
          </div>

          {waiting.length === 0 ? (
            <div style={{
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: '16px', padding: '3rem',
              textAlign: 'center', color: 'rgba(255,255,255,0.15)',
              fontSize: '1rem',
            }}>
              No patients currently waiting
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.min(waiting.length, 6)}, 1fr)`,
              gap: '1rem',
            }}>
              {waiting.map((entry, i) => (
                <div key={entry.id} style={{
                  background: i === 0
                    ? 'linear-gradient(135deg, rgba(255,215,64,0.12), rgba(255,152,0,0.08))'
                    : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${i === 0 ? 'rgba(255,215,64,0.4)' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: '16px',
                  padding: '1.5rem 1rem',
                  textAlign: 'center',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.3s',
                }}>
                  {i === 0 && (
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0,
                      height: '3px',
                      background: 'linear-gradient(90deg, #ffd740, #ff8f00)',
                    }} />
                  )}
                  <div style={{
                    fontSize: '2.5rem', fontWeight: 900,
                    color: i === 0 ? '#ffd740' : 'rgba(255,255,255,0.5)',
                    lineHeight: 1,
                    marginBottom: '0.5rem',
                  }}>#{entry.queue_position}</div>
                  <div style={{
                    fontSize: '1rem', fontWeight: 700,
                    color: i === 0 ? '#fff' : 'rgba(255,255,255,0.6)',
                    marginBottom: '0.25rem',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {entry.patient_name}
                  </div>
                  {entry.estimated_wait_minutes !== null && (
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>
                      ~{entry.estimated_wait_minutes} min wait
                    </div>
                  )}
                  {i === 0 && (
                    <div style={{
                      marginTop: '0.5rem',
                      fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.15em',
                      color: '#ffd740',
                    }}>YOU&apos;RE NEXT</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.3)',
        padding: '0.75rem 2.5rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Hospital Queue Management System · South Africa
          </span>
          <span style={{ color: 'rgba(255,255,255,0.1)' }}>·</span>
          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)' }}>
            Powered by MediQueue AI
          </span>
        </div>
        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)' }}>
          Last updated: {lastUpdated.toLocaleTimeString('en-ZA')} · {doctorId ? 'Live via Socket.io' : 'Polling every 30s'}
        </div>
      </footer>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
