/*
    Service: EmailService
    Description: Service to send emails using nodemailer and queueService
    Methods:
        - sendEmail(to: string, template: file, locals?: object): Promise<void>
        - processEmailJob(jobData: any): Promise<void>
    Usage:
        - Use sendEmail method to send an email. It will add the email job to the emailQueue
        - The emailQueue will process the email job and send the email using nodemailer
        - If the email fails to send, it will log an error. If the email is sent successfully, it will log a success message
*/
import nodemailer from 'nodemailer';
import path from 'path';
import type { Job } from 'bullmq';
import logger from '@/services/loggerService';
import { setJobProgress } from '@/utils/jobProgress';
import { queueService } from '@/services/queueService';
import { SendEmailFunction, emailJobData } from '@/types/types'; 
import handlebars from 'handlebars';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

class EmailService {
    private partialsRegistered = false;

    private transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
    });

    private ensurePartials(): void {
        if (this.partialsRegistered) return;
        const partialsDir = path.join(__dirname, '../templates/partials');
        if (!fs.existsSync(partialsDir)) {
            this.partialsRegistered = true;
            return;
        }
        for (const file of fs.readdirSync(partialsDir)) {
            if (!file.endsWith('.hbs')) continue;
            const partialName = path.basename(file, '.hbs');
            const partialPath = path.join(partialsDir, file);
            handlebars.registerPartial(partialName, fs.readFileSync(partialPath, 'utf8'));
        }
        this.partialsRegistered = true;
    }

    public sendEmail: SendEmailFunction = async (to, templateName, subject, locals) => {
        const emailData = { to, templateName, subject, locals };
        await queueService.addJob('emailQueue', 'sendEmail', emailData); // QueueName, JobName, JobData
        logger.info(`Email Job added to Queue: emailQueue`, { service: 'emailService'});
    }

    public processEmailJob = async (jobData: emailJobData, job?: Job) => {
        var { to, templateName, subject, locals } = jobData;
        locals = { ...locals, appName: process.env.PUBLIC_NAME, appUrl: process.env.PUBLIC_APP_URL, year: new Date().getFullYear() };

        await setJobProgress(job, 10);
        this.ensurePartials();
        const templatePath = path.join(__dirname, '../templates', `${templateName}.hbs`);
        const source = fs.readFileSync(templatePath, 'utf8');
        const template = handlebars.compile(source);
        const htmlContent = template(locals);

        await setJobProgress(job, 50);
        const mailOptions = {
            from: `${process.env.PUBLIC_NAME} ${process.env.SMTP_USER}`,
            to,
            subject: subject,
            html: htmlContent,
        };

        try {
            await this.transporter.sendMail(mailOptions);
            await setJobProgress(job, 100);
            logger.info(`${templateName} Email sent to ${to}`, { service: 'emailService'});
        } catch (error: any) {
            logger.error(`Error sending email to ${to}: ${error.message}`, { service: 'emailService'});
            throw error;
        }
    }

}

export const emailService = new EmailService();