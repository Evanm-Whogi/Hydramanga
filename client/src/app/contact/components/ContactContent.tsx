"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { toast } from "react-toastify";
import InputField from "@/components/InputField";
import { sendContactMessage, sendDmcaNotice } from "@/services/contactService";

const initialContactState = {
  name: "",
  email: "",
  subject: "",
  message: "",
};

const initialDmcaState = {
  name: "",
  email: "",
  description: "",
  references: "",
};

export default function ContactContent() {
  const [contactForm, setContactForm] = useState(initialContactState);
  const [dmcaForm, setDmcaForm] = useState(initialDmcaState);
  const [isContactSubmitting, setIsContactSubmitting] = useState(false);
  const [isDmcaSubmitting, setIsDmcaSubmitting] = useState(false);

  const handleContactSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsContactSubmitting(true);

    try {
      await sendContactMessage(contactForm);
      toast.success("Message sent! We will get back to you soon.");
      setContactForm(initialContactState);
    } catch (error: any) {
      toast.error(error?.message || "Failed to send message.");
    } finally {
      setIsContactSubmitting(false);
    }
  };

  const handleDmcaSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsDmcaSubmitting(true);

    try {
      await sendDmcaNotice(dmcaForm);
      toast.success("DMCA notice submitted. Our legal team will review it.");
      setDmcaForm(initialDmcaState);
    } catch (error: any) {
      toast.error(error?.message || "Failed to submit DMCA notice.");
    } finally {
      setIsDmcaSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="bg-foreground p-5 rounded-lg border border-borders flex flex-col">
          <div>
            <h2 className="text-xl font-bold text-primary">General Contact</h2>
            <p className="text-sm text-muted">Questions, feedback, or support requests? Send us a message.</p>
          </div>

          <form onSubmit={handleContactSubmit} className="mt-4 flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <InputField
                label="Name"
                placeholder="Your name"
                value={contactForm.name}
                onChange={(event: any) => setContactForm({ ...contactForm, name: event.target.value })}
                required
              />
              <InputField
                label="Email"
                placeholder="you@email.com"
                type="email"
                value={contactForm.email}
                onChange={(event: any) => setContactForm({ ...contactForm, email: event.target.value })}
                required
              />
            </div>

            <InputField
              label="Subject"
              placeholder="How can we help?"
              value={contactForm.subject}
              onChange={(event: any) => setContactForm({ ...contactForm, subject: event.target.value })}
              required
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-muted ml-1">Message</label>
              <textarea
                rows={5}
                required
                value={contactForm.message}
                onChange={(event) => setContactForm({ ...contactForm, message: event.target.value })}
                placeholder="Give us the details so we can respond quickly."
                className="w-full bg-foreground border border-borders text-muted px-4 py-2.5 rounded-xl outline-none transition-all focus:border-borders focus:ring-1 focus:ring-borders"
              />
            </div>

            <button
              type="submit"
              disabled={isContactSubmitting}
              className="bg-background hover:bg-background/50 px-2 py-2 rounded-lg inline-flex place-content-center items-center text-lg hover:cursor-pointer mt-1 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isContactSubmitting ? "Sending..." : "Send message"}
            </button>
          </form>
        </div>

        <div className="bg-foreground p-5 rounded-lg border border-borders flex flex-col">
          <div>
            <h2 className="text-xl font-bold text-primary">DMCA Submission</h2>
            <p className="text-sm text-muted">Report copyright concerns with the details we need to investigate.</p>
          </div>

          <form onSubmit={handleDmcaSubmit} className="mt-4 flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <InputField
                label="Name"
                placeholder="Legal name"
                value={dmcaForm.name}
                onChange={(event: any) => setDmcaForm({ ...dmcaForm, name: event.target.value })}
                required
              />
              <InputField
                label="Email"
                placeholder="you@company.com"
                type="email"
                value={dmcaForm.email}
                onChange={(event: any) => setDmcaForm({ ...dmcaForm, email: event.target.value })}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-muted ml-1">Description of infringement</label>
              <textarea
                rows={4}
                required
                value={dmcaForm.description}
                onChange={(event) => setDmcaForm({ ...dmcaForm, description: event.target.value })}
                placeholder="Describe the copyrighted work and the infringing material."
                className="w-full bg-foreground border border-borders text-muted px-4 py-2.5 rounded-xl outline-none transition-all focus:border-borders focus:ring-1 focus:ring-borders"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-muted ml-1">Relevant names, links, or IDs</label>
              <textarea
                rows={3}
                required
                value={dmcaForm.references}
                onChange={(event) => setDmcaForm({ ...dmcaForm, references: event.target.value })}
                placeholder="URLs, series name, chapter IDs, or any identifiers."
                className="w-full bg-foreground border border-borders text-muted px-4 py-2.5 rounded-xl outline-none transition-all focus:border-borders focus:ring-1 focus:ring-borders"
              />
            </div>

            <button
              type="submit"
              disabled={isDmcaSubmitting}
              className="bg-background hover:bg-background/50 px-2 py-2 rounded-lg inline-flex place-content-center items-center text-lg hover:cursor-pointer mt-1 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isDmcaSubmitting ? "Submitting..." : "Submit DMCA"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
