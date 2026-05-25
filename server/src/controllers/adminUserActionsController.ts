import { Request, Response, NextFunction } from 'express';
import { adminUserActionsService } from '@/services/adminUserActionsService';
import logger from '@/services/loggerService';

export async function sendAdminUserVerification(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ message: 'User ID is required' });

    const result = await adminUserActionsService.sendVerificationEmail(userId);

    if ('error' in result) {
      switch (result.error) {
        case 'not_found':
          return res.status(404).json({ message: 'User not found' });
        case 'already_verified':
          return res.status(400).json({ message: 'Email is already verified' });
        default:
          return res.status(400).json({ message: 'Failed to send verification email' });
      }
    }

    logger.info(`Admin ${req.user?.id} sent verification email to user ${userId}`, {
      service: 'adminUserActionsController',
    });

    return res.json({ status: 200, message: 'Verification email sent' });
  } catch (error) {
    logger.error(`Failed to send admin verification email: ${error}`, {
      service: 'adminUserActionsController',
    });
    return next(error);
  }
}

export async function sendAdminUserPasswordReset(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ message: 'User ID is required' });

    const result = await adminUserActionsService.sendPasswordReset(userId);

    if ('error' in result) {
      switch (result.error) {
        case 'not_found':
          return res.status(404).json({ message: 'User not found' });
        case 'no_credential_account':
          return res.status(400).json({
            message: 'This user has no email/password account (OAuth only)',
          });
        default:
          return res.status(400).json({ message: 'Failed to send password reset email' });
      }
    }

    logger.info(`Admin ${req.user?.id} sent password reset to user ${userId}`, {
      service: 'adminUserActionsController',
    });

    return res.json({ status: 200, message: 'Password reset email sent' });
  } catch (error) {
    logger.error(`Failed to send admin password reset: ${error}`, {
      service: 'adminUserActionsController',
    });
    return next(error);
  }
}
