import { useEffect, useState } from "react";

type Info = { studioName: string; legalName: string; address: string; contactEmail: string };

/**
 * Public privacy policy (no sign-in) — the page Meta asks for before an app goes live, with the data-deletion
 * section at #delete. The studio's name, address and contact email come from Settings → Workspace.
 */
export function PrivacyPage() {
  const [info, setInfo] = useState<Info>();
  useEffect(() => {
    document.title = "Privacy policy";
    fetch("/api/public/privacy-info")
      .then((r) => (r.ok ? r.json() : undefined))
      .then(setInfo, () => setInfo(undefined));
  }, []);
  const name = info?.legalName || info?.studioName || "The Oyster Studios";
  const contact = info?.contactEmail;
  const email = contact ? <a href={`mailto:${contact}`} className="underline">{contact}</a> : "the studio's enquiry email";

  return (
    <main className="min-h-dvh bg-bg px-4 py-12">
      <article className="t-body mx-auto max-w-[68ch] text-ink-2 [&_h2]:t-sheet [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-ink [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1.5">
        <img src="/logo.png" alt={name} className="mb-6 h-20 w-auto" />
        <h1 className="t-title m-0 text-ink">Privacy policy</h1>
        <p className="t-meta text-ink-3">{name}{info?.address ? ` · ${info.address.replace(/\n/g, ", ")}` : ""}</p>

        <p>
          {name} ("we") uses a customer relationship system to reply to people who contact us and to manage our client work. This page explains what we
          keep when you message us, why, and how to have it deleted.
        </p>

        <h2>What we keep</h2>
        <ul>
          <li>When you message our Instagram account: your Instagram name and username, the messages in that conversation, and when they were sent.</li>
          <li>When you message our WhatsApp Business number: your WhatsApp name and phone number, the messages in that conversation, and when they were sent.</li>
          <li>When you email us or book a meeting with us: your name, email address, the message or booking, and when it was sent.</li>
          <li>If we go on to work together: the contact details you give us, what we agree to do, and our invoices to you.</li>
          <li>A photo for your client record, if you share one with us or it is your Instagram profile picture when you message us on Instagram. It is removed when your record is deleted.</li>
        </ul>
        <p>We do not collect anything else from your Instagram, WhatsApp, email or calendar account. Our team can reply to your Instagram and WhatsApp messages from this system; it never posts publicly or changes your account.</p>

        <h2>Why we keep it</h2>
        <p>To answer your enquiry, follow up on it, and — if you become a client — deliver our work and bill for it. We do not sell your information or use it for advertising.</p>

        <h2>Where it's kept and who can see it</h2>
        <p>
          It is stored on Google Cloud servers in Mumbai, India, and can be seen only by our team members who sign in to our system. The companies that run
          that infrastructure process it for us under their own security and privacy terms.
        </p>

        <h2>How long we keep it</h2>
        <p>
          For as long as it's useful for your enquiry or our work together. Invoices and the details on them are kept for as long as Indian tax law requires.
        </p>

        <h2>Your rights</h2>
        <p>
          Under India's Digital Personal Data Protection Act, 2023, you can ask to see the information we hold about you, correct it, or have it deleted.
          Write to {email}.
        </p>

        <h2 id="delete">Deleting your data</h2>
        <p>
          To have your information removed, email {email} with your name and the Instagram username, WhatsApp number or email address you contacted us from. We will delete
          your messages and contact details within 30 days and confirm by email. Invoices we are legally required to keep are kept, without anything beyond
          what the law requires.
        </p>

        <p className="t-meta mt-10 text-ink-3">Last updated: 20 October 2026</p>
      </article>
    </main>
  );
}
