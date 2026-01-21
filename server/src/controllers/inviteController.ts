import { Request, Response, NextFunction } from 'express';
import { db, schema } from '@/db/index';
import { eq, and, isNull, desc } from 'drizzle-orm';
import logger from '@/services/loggerService';
import { nanoid } from 'nanoid';

/**
 * Generate a new invite code for the authenticated user
 */
export async function generateInviteCode(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.user.id;

    // Check how many people this user has already invited (used codes)
    const usedCodes = await db
      .select()
      .from(schema.inviteCodes)
      .where(eq(schema.inviteCodes.createdBy, userId))
      .orderBy(desc(schema.inviteCodes.usedBy));

    const invitedCount = usedCodes.filter(code => code.usedBy !== null).length;

    // Users can only invite 5 people max
    if (invitedCount >= 5) {
      return res.status(400).json({
        success: false,
        message: 'You have reached your invite limit of 5 people. Check back later or contact support.',
      });
    }

    // Check how many active (unused) codes the user has
    const activeCodes = await db
      .select()
      .from(schema.inviteCodes)
      .where(and(eq(schema.inviteCodes.createdBy, userId), isNull(schema.inviteCodes.usedBy)));

    // Users can have max 5 active invite codes at a time
    if (activeCodes.length >= 5) {
      return res.status(400).json({
        success: false,
        message: 'You can only have 5 active invite codes at a time. Share an existing code or wait for it to be claimed.',
      });
    }

    // Generate unique code
    const code = nanoid(8).toUpperCase();
    const inviteId = nanoid();

    const newInvite = await db.insert(schema.inviteCodes).values({
      id: inviteId,
      code,
      createdBy: userId,
    }).returning();

    logger.info(`New invite code generated: ${code} by user ${userId}`, { service: 'inviteController' });

    return res.json({
      success: true,
      data: newInvite[0],
    });
  } catch (error) {
    logger.error(`Failed to generate invite code: ${error}`, { service: 'inviteController' });
    return next(error);
  }
}

/**
 * Get all invite codes for the authenticated user
 */
export async function getUserInviteCodes(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.user.id;

    const codes = await db
      .select({
        id: schema.inviteCodes.id,
        code: schema.inviteCodes.code,
        createdAt: schema.inviteCodes.createdAt,
        usedAt: schema.inviteCodes.usedAt,
        usedBy: schema.inviteCodes.usedBy,
        usedByName: schema.user.name,
        usedByImage: schema.user.image,
      })
      .from(schema.inviteCodes)
      .leftJoin(schema.user, eq(schema.inviteCodes.usedBy, schema.user.id))
      .where(eq(schema.inviteCodes.createdBy, userId))
      .orderBy(desc(schema.inviteCodes.createdAt));

    const formattedCodes = codes.map(c => ({
      id: c.id,
      code: c.code,
      createdAt: c.createdAt,
      used: c.usedBy !== null,
      usedAt: c.usedAt,
      usedByUser: c.usedBy ? {
        id: c.usedBy,
        name: c.usedByName,
        image: c.usedByImage,
      } : null,
    }));

    return res.json({
      success: true,
      data: formattedCodes,
    });
  } catch (error) {
    logger.error(`Failed to get user invite codes: ${error}`, { service: 'inviteController' });
    return next(error);
  }
}

/**
 * Validate an invite code
 */
export async function validateInviteCode(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const { code } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Invite code is required',
      });
    }

    const invite = await db
      .select()
      .from(schema.inviteCodes)
      .where(eq(schema.inviteCodes.code, code.toUpperCase()))
      .limit(1);

    if (invite.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'This invite code does not exist',
      });
    }

    const inviteCode = invite[0];

    if (inviteCode.usedBy) {
      return res.status(400).json({
        success: false,
        message: 'This invite code has already been used',
      });
    }

    return res.json({
      success: true,
      data: {
        id: inviteCode.id,
        code: inviteCode.code,
        valid: true,
      },
    });
  } catch (error) {
    logger.error(`Failed to validate invite code: ${error}`, { service: 'inviteController' });
    return next(error);
  }
}

/**
 * Mark an invite code as used (can be called from registration)
 */
export async function useInviteCode(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const { code, userId } = req.body;

    if (!code || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Code and userId are required',
      });
    }

    const invite = await db
      .select()
      .from(schema.inviteCodes)
      .where(eq(schema.inviteCodes.code, code.toUpperCase()))
      .limit(1);

    if (invite.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invalid invite code',
      });
    }

    if (invite[0].usedBy) {
      return res.status(400).json({
        success: false,
        message: 'This invite code has already been used',
      });
    }

    await db
      .update(schema.inviteCodes)
      .set({
        usedBy: userId,
        usedAt: new Date(),
      })
      .where(eq(schema.inviteCodes.id, invite[0].id));

    // Initialize 5 invite codes for the new user
    await initializeUserInviteCodes(userId);

    logger.info(`Invite code ${code} used by user ${userId}`, { service: 'inviteController' });

    return res.json({
      success: true,
      message: 'Invite code used successfully',
    });
  } catch (error) {
    logger.error(`Failed to use invite code: ${error}`, { service: 'inviteController' });
    return next(error);
  }
}

/**
 * Initialize 5 invite codes for a new user (internal function)
 */
export async function initializeUserInviteCodes(userId: string): Promise<void> {
  try {
    const invites = [];
    for (let i = 0; i < 5; i++) {
      invites.push({
        id: nanoid(),
        code: nanoid(8).toUpperCase(),
        createdBy: userId,
      });
    }

    await db.insert(schema.inviteCodes).values(invites);
    logger.info(`Initialized 5 invite codes for user ${userId}`, { service: 'inviteController' });
  } catch (error) {
    logger.error(`Failed to initialize invite codes: ${error}`, { service: 'inviteController' });
    throw error;
  }
}
