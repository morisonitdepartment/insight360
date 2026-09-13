import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { AuthProvider } from '@/contexts/AuthContext'
import { DataProvider } from '@/contexts/DataContext'
import { FilterProvider } from '@/contexts/FilterContext'
import { GuidedDemoProvider } from '@/contexts/GuidedDemoContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { Guard, RedirectIfAuthed, RequireAuth } from '@/components/layout/RouteGuard'
import { NotFoundPage } from '@/pages/NotFoundPage'

// Route-based code splitting: every page is lazy-loaded.
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const OverviewPage = lazy(() => import('@/pages/overview/OverviewPage'))
const VisitsPage = lazy(() => import('@/pages/operations/VisitsPage'))
const VisitDetailPage = lazy(() => import('@/pages/operations/VisitDetailPage'))
const AssessmentPage = lazy(() => import('@/pages/operations/AssessmentPage'))
const CalendarPage = lazy(() => import('@/pages/operations/CalendarPage'))
const AssignmentsPage = lazy(() => import('@/pages/operations/AssignmentsPage'))
const ShoppersPage = lazy(() => import('@/pages/operations/ShoppersPage'))
const ShopperDetailPage = lazy(() => import('@/pages/operations/ShopperDetailPage'))
const ExecutiveDashboardPage = lazy(() => import('@/pages/performance/ExecutiveDashboardPage'))
const OutletsPage = lazy(() => import('@/pages/performance/OutletsPage'))
const OutletDetailPage = lazy(() => import('@/pages/performance/OutletDetailPage'))
const ComparePage = lazy(() => import('@/pages/performance/ComparePage'))
const KpiAnalyticsPage = lazy(() => import('@/pages/performance/KpiAnalyticsPage'))
const BenchmarkingPage = lazy(() => import('@/pages/performance/BenchmarkingPage'))
const TrendsPage = lazy(() => import('@/pages/performance/TrendsPage'))
const FindingsPage = lazy(() => import('@/pages/quality/FindingsPage'))
const CorrectiveActionsPage = lazy(() => import('@/pages/quality/CorrectiveActionsPage'))
const AlertsPage = lazy(() => import('@/pages/quality/AlertsPage'))
const VisitReportsPage = lazy(() => import('@/pages/reports/VisitReportsPage'))
const VisitReportPage = lazy(() => import('@/pages/reports/VisitReportPage'))
const ManagementReportsPage = lazy(() => import('@/pages/reports/ManagementReportsPage'))
const ReportBuilderPage = lazy(() => import('@/pages/reports/ReportBuilderPage'))
const ExportsPage = lazy(() => import('@/pages/reports/ExportsPage'))
const EvidenceLibraryPage = lazy(() => import('@/pages/evidence/EvidenceLibraryPage'))
const AdminOutletsPage = lazy(() => import('@/pages/admin/AdminOutletsPage'))
const UsersPage = lazy(() => import('@/pages/admin/UsersPage'))
const RolesPage = lazy(() => import('@/pages/admin/RolesPage'))
const TemplatesPage = lazy(() => import('@/pages/admin/TemplatesPage'))
const KpiConfigPage = lazy(() => import('@/pages/admin/KpiConfigPage'))
const NotificationRulesPage = lazy(() => import('@/pages/admin/NotificationRulesPage'))
const SettingsPage = lazy(() => import('@/pages/admin/SettingsPage'))
const ActivityLogsPage = lazy(() => import('@/pages/admin/ActivityLogsPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))

const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter basename={basename}>
        <AuthProvider>
          <DataProvider>
            <FilterProvider>
              <GuidedDemoProvider>
                <Routes>
                  <Route
                    path="/login"
                    element={
                      <RedirectIfAuthed>
                        <LoginPage />
                      </RedirectIfAuthed>
                    }
                  />
                  <Route
                    path="/"
                    element={
                      <RequireAuth>
                        <AppLayout />
                      </RequireAuth>
                    }
                  >
                    <Route index element={<Guard permission="dashboard.overview"><OverviewPage /></Guard>} />

                    <Route path="operations">
                      <Route index element={<Navigate to="/operations/visits" replace />} />
                      <Route path="visits" element={<Guard permission="visits.view"><VisitsPage /></Guard>} />
                      <Route path="visits/:id" element={<Guard permission="visits.view"><VisitDetailPage /></Guard>} />
                      <Route path="visits/:id/audit" element={<Guard permission="visits.conduct"><AssessmentPage /></Guard>} />
                      <Route path="calendar" element={<Guard permission="calendar.view"><CalendarPage /></Guard>} />
                      <Route path="assignments" element={<Guard permission="visits.assign"><AssignmentsPage /></Guard>} />
                      <Route path="shoppers" element={<Guard permission="shoppers.view"><ShoppersPage /></Guard>} />
                      <Route path="shoppers/:id" element={<Guard permission="shoppers.view"><ShopperDetailPage /></Guard>} />
                    </Route>

                    <Route path="performance">
                      <Route index element={<Navigate to="/performance/executive" replace />} />
                      <Route path="executive" element={<Guard permission="dashboard.executive"><ExecutiveDashboardPage /></Guard>} />
                      <Route path="outlets" element={<Guard permission="outlets.view"><OutletsPage /></Guard>} />
                      <Route path="outlets/:id" element={<Guard permission="outlets.view"><OutletDetailPage /></Guard>} />
                      <Route path="compare" element={<Guard permission="outlets.compare"><ComparePage /></Guard>} />
                      <Route path="kpi" element={<Guard permission="analytics.view"><KpiAnalyticsPage /></Guard>} />
                      <Route path="benchmarking" element={<Guard permission="analytics.view"><BenchmarkingPage /></Guard>} />
                      <Route path="trends" element={<Guard permission="analytics.view"><TrendsPage /></Guard>} />
                    </Route>

                    <Route path="quality">
                      <Route index element={<Navigate to="/quality/findings" replace />} />
                      <Route path="findings" element={<Guard permission="findings.view"><FindingsPage /></Guard>} />
                      <Route path="corrective-actions" element={<Guard permission="actions.view"><CorrectiveActionsPage /></Guard>} />
                      <Route path="alerts" element={<Guard permission="alerts.view"><AlertsPage /></Guard>} />
                    </Route>

                    <Route path="reports">
                      <Route index element={<Navigate to="/reports/visits" replace />} />
                      <Route path="visits" element={<Guard permission="reports.visit"><VisitReportsPage /></Guard>} />
                      <Route path="visits/:id" element={<Guard anyOf={['reports.visit', 'visits.conduct']}><VisitReportPage /></Guard>} />
                      <Route path="management" element={<Guard permission="reports.management"><ManagementReportsPage /></Guard>} />
                      <Route path="builder" element={<Guard permission="reports.build"><ReportBuilderPage /></Guard>} />
                      <Route path="exports" element={<Guard permission="reports.export"><ExportsPage /></Guard>} />
                    </Route>

                    <Route path="evidence" element={<Guard permission="evidence.view"><EvidenceLibraryPage /></Guard>} />

                    <Route path="admin">
                      <Route index element={<Navigate to="/admin/users" replace />} />
                      <Route path="outlets" element={<Guard permission="admin.outlets"><AdminOutletsPage /></Guard>} />
                      <Route path="users" element={<Guard anyOf={['admin.users', 'admin.stakeholders']}><UsersPage /></Guard>} />
                      <Route path="roles" element={<Guard permission="admin.roles"><RolesPage /></Guard>} />
                      <Route path="templates" element={<Guard permission="admin.templates"><TemplatesPage /></Guard>} />
                      <Route path="kpi" element={<Guard permission="admin.kpi"><KpiConfigPage /></Guard>} />
                      <Route path="notifications" element={<Guard permission="admin.notifications"><NotificationRulesPage /></Guard>} />
                      <Route path="settings" element={<Guard permission="admin.settings"><SettingsPage /></Guard>} />
                      <Route path="activity" element={<Guard permission="admin.logs"><ActivityLogsPage /></Guard>} />
                    </Route>

                    <Route path="profile" element={<ProfilePage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                  <Route path="*" element={<NotFoundPage standalone />} />
                </Routes>
                <Toaster
                  position="top-right"
                  toastOptions={{
                    duration: 3500,
                    style: { fontSize: 13, borderRadius: 10, padding: '10px 14px' },
                    success: { iconTheme: { primary: '#289f9c', secondary: '#fff' } },
                  }}
                />
              </GuidedDemoProvider>
            </FilterProvider>
          </DataProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
