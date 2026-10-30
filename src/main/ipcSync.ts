import { ipcMain } from 'electron'
import type { SupabaseConfig } from '@core/settings/model'
import { IPC } from '@shared/ipc'
import type { SyncService } from './sync/syncService'

export function registerSyncIpc(sync: SyncService): void {
  ipcMain.handle(IPC.syncStatus, () => sync.status())
  ipcMain.handle(IPC.syncConfigure, (_e, config: SupabaseConfig | null) => sync.configure(config))
  ipcMain.handle(IPC.syncSignUp, (_e, email: string, password: string) => sync.signUp(email, password))
  ipcMain.handle(IPC.syncSignIn, (_e, email: string, password: string) => sync.signIn(email, password))
  ipcMain.handle(IPC.syncSignOut, () => sync.signOut())
  ipcMain.handle(IPC.syncCreateOrg, (_e, name: string) => sync.createOrg(name))
  ipcMain.handle(IPC.syncJoinOrg, (_e, code: string) => sync.joinOrg(code))
  ipcMain.handle(IPC.syncLeaveOrg, () => sync.leaveOrg())
  ipcMain.handle(IPC.syncMembers, () => sync.members())
  ipcMain.handle(IPC.syncSetMemberRole, (_e, userId: string, role: 'admin' | 'member') =>
    sync.setMemberRole(userId, role)
  )
  ipcMain.handle(IPC.syncRemoveMember, (_e, userId: string) => sync.removeMember(userId))
  ipcMain.handle(IPC.syncRotateInvite, () => sync.rotateInviteCode())
  ipcMain.handle(IPC.syncNow, () => sync.syncNow())
}
