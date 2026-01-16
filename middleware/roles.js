/**
 * Role-based Access Control Middleware
 */

import { USER_ROLES } from "../utils/constants.js";
import { ForbiddenError } from "../utils/errors.js";

/**
 * Require admin role
 */

export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.user.role !== USER_ROLES.ADMIN) {
    return res.status(403).json({
      error: "Access denied",
      message: "Admin privileges required",
    });
  }

  next();
}
