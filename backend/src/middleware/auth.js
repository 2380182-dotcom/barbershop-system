import { logAudit } from '../lib/audit.js';

export function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

export function requireRole(...roles) {
  return async (req, res, next) => {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.session.user.role)) {
      await logAudit({
        userId: req.session.user.id,
        action: 'role_restricted_rejection',
        entity: 'route',
        detail: { path: req.originalUrl, method: req.method, role: req.session.user.role, requiredRoles: roles },
      });
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
