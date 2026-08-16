import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { Login } from './pages/Login.jsx';
import { ShopSettings } from './pages/ShopSettings.jsx';
import { Barbers } from './pages/Barbers.jsx';
import { Services } from './pages/Services.jsx';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/settings" replace />} />
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
