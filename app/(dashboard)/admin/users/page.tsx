'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';

interface AdminUser { id: number; email: string; first_name: string; last_name: string; phone_number: string | null; id_number: string; is_active: boolean; created_at: string; roles: string }

export default function AdminUsersPage() {
  const { apiFetch } = useApi();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
    if (search) params.set('search', search);
    if (roleFilter) params.set('role', roleFilter);
    const res = await apiFetch(`/api/admin/users?${params}`);
    if (res.ok) {
      const d = await res.json();
      setUsers(d.data ?? []);
      setTotal(d.pagination?.total ?? 0);
    }
    setLoading(false);
  }, [search, roleFilter, offset, apiFetch]);

  useEffect(() => { load(); }, [load]);

  async function toggleActive(user: AdminUser) {
    await apiFetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !user.is_active }),
    });
    load();
  }

  async function saveEdit() {
    if (!editUser) return;
    setSaving(true);
    await apiFetch(`/api/admin/users/${editUser.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ first_name: editUser.first_name, last_name: editUser.last_name, phone_number: editUser.phone_number }),
    });
    setSaving(false);
    setEditUser(null);
    load();
  }

  return (
    <div>
      <Header title="User Management" subtitle="Manage doctors, receptionists, patients, and admins" />
      <div className="p-8 space-y-5">
        <div className="flex gap-4 flex-wrap">
          <Input label="" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..." className="w-64" />
          <Select label="" value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            options={[{ value: 'Patient', label: 'Patient' }, { value: 'Doctor', label: 'Doctor' },
              { value: 'Nurse', label: 'Nurse' }, { value: 'Receptionist', label: 'Receptionist' }, { value: 'Admin', label: 'Admin' }]}
            placeholder="All roles" className="w-40" />
        </div>

        <Card subtitle={`${total} users found`}>
          {loading ? (
            <div className="flex justify-center py-12"><span className="animate-spin text-3xl">⏳</span></div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="pb-3 pr-4">Name</th>
                      <th className="pb-3 pr-4">Email</th>
                      <th className="pb-3 pr-4">Roles</th>
                      <th className="pb-3 pr-4">SA ID</th>
                      <th className="pb-3 pr-4">Status</th>
                      <th className="pb-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="py-3 pr-4 font-medium text-gray-900">{u.first_name} {u.last_name}</td>
                        <td className="py-3 pr-4 text-gray-600">{u.email}</td>
                        <td className="py-3 pr-4">
                          {u.roles?.split(',').map((r: string) => (
                            <Badge key={r} label={r.trim()} color="blue" />
                          ))}
                        </td>
                        <td className="py-3 pr-4 text-gray-500 font-mono text-xs">{u.id_number}</td>
                        <td className="py-3 pr-4">
                          <Badge label={u.is_active ? 'Active' : 'Disabled'} color={u.is_active ? 'green' : 'red'} />
                        </td>
                        <td className="py-3">
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setEditUser(u)}>Edit</Button>
                            <Button size="sm" variant={u.is_active ? 'danger' : 'success'}
                              onClick={() => toggleActive(u)}>
                              {u.is_active ? 'Disable' : 'Enable'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
                <span>Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>← Prev</Button>
                  <Button size="sm" variant="ghost" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}>Next →</Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Edit User">
        {editUser && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" value={editUser.first_name}
                onChange={(e) => setEditUser((u) => u ? { ...u, first_name: e.target.value } : null)} />
              <Input label="Last Name" value={editUser.last_name}
                onChange={(e) => setEditUser((u) => u ? { ...u, last_name: e.target.value } : null)} />
            </div>
            <Input label="Phone" value={editUser.phone_number ?? ''}
              onChange={(e) => setEditUser((u) => u ? { ...u, phone_number: e.target.value } : null)} />
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button loading={saving} onClick={saveEdit}>Save Changes</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
