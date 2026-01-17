import { Request, Response, NextFunction } from 'express';
import { db, schema } from '@/db/index';
import { eq, or, and, sql, asc, desc, count, gte, inArray, isNotNull, not, isNull  } from 'drizzle-orm';
import dotenv from 'dotenv';
dotenv.config();


export default async function getIndexPage(req: Request, res: Response, next: NextFunction): Promise<Response | void> {

    const [mangaTitlesResult, userResult] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(schema.series),
        db.select({ count: sql<number>`count(*)` }).from(schema.user),
    ]);


    return res.json({
       mangaTitles: mangaTitlesResult[0]['count'],
       userCount: userResult[0]['count']

    });

}