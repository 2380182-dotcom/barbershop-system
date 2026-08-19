import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { Login } from './pages/Login.jsx';
import { ShopSettings } from './pages/ShopSettings.jsx';
import { Barbers } from './pages/Barbers.jsx';
import { Services } from './pages/Services.jsx';
import { Tablet } from './pages/Tablet.jsx';
import { Display } from './pages/Display.jsx';
import { Appointments } from './pages/Appointments.jsx';
import { OwnerAttendance } from './pages/OwnerAttendance.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { Customers } from './pages/Customers.jsx';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/display" element={<Display />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/tablet" replace />} />
        <Route path="/tablet" element={<Tablet />} />
        <Route path="/appointments" element={<Appointments />} />
        <Route
          path="/attendance"
          element={
            <ProtectedRoute roles={['owner']}>
              <OwnerAttendance />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute roles={['owner']}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customers"
          element={
            <ProtectedRoute roles={['owner']}>
              <Customers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute roles={['owner']}>
              <ShopSettings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/barbers"
          element={
            <ProtectedRoute roles={['owner']}>
              <Barbers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/services"
          element={
            <ProtectedRoute roles={['owner']}>
              <Services />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  );
}

export default App;
