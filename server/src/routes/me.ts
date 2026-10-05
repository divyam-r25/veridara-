import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { User } from '../models/User';
import { createError } from '../middleware/errorHandler';

export const meRouter = Router();
meRouter.use(requireAuth);

meRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return next(createError('User not found', 404, 'USER_NOT_FOUND'));
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    next(err);
  }
});
