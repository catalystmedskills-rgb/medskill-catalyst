import Link from "next/link";
import { IconMail, IconPhone, IconWhatsApp } from "@/src/components/careers/ui";

// Mirrors the homepage footer (public/index.html): same tagline, contact set,
// Programme / Support columns and legal bar — with SVG icons instead of emoji.
export function CareersFooter() {
  return (
    <footer className="bg-teal-deep text-white py-14 md:py-16 font-body">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          {/* Brand Info */}
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-3 mb-4" aria-label="MedSkills Catalyst — Home">
              <div className="h-10 w-10 flex-shrink-0">
                <img
                  src="/brand/logo/MedSkills-Catalyst_Logo-01.svg"
                  alt="MedSkills Catalyst logo"
                  className="h-full w-auto object-contain"
                />
              </div>
              <span className="font-display text-[1.25rem] font-bold tracking-[-0.01em]">
                MedSkills Catalyst
              </span>
            </Link>
            <p className="text-[0.9rem] text-white/70 max-w-sm leading-relaxed mb-6">
              India&apos;s most rigorous career-transition programme for pharma professionals and life
              science graduates entering medical device and MedTech sales.
            </p>
            <div className="flex flex-col gap-2.5 text-[0.85rem] text-white/60">
              <a href="tel:+919759249395" className="inline-flex items-center gap-2 hover:text-white transition-colors">
                <IconPhone className="h-4 w-4 shrink-0" /> +91 97592 49395
              </a>
              <a href="tel:+919971699186" className="inline-flex items-center gap-2 hover:text-white transition-colors">
                <IconPhone className="h-4 w-4 shrink-0" /> +91 99716 99186
              </a>
              <a href="mailto:info@medskillscatalyst.com" className="inline-flex items-center gap-2 hover:text-white transition-colors">
                <IconMail className="h-4 w-4 shrink-0" /> info@medskillscatalyst.com
              </a>
              <a
                href="https://wa.me/918800665154"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 hover:text-white transition-colors"
              >
                <IconWhatsApp className="h-4 w-4 shrink-0" /> Chat on WhatsApp
              </a>
            </div>
          </div>

          {/* Programme — same links as homepage footer */}
          <div>
            <h4 className="text-[0.875rem] font-bold uppercase tracking-[0.05em] text-teal-leg mb-4">
              Programme
            </h4>
            <div className="flex flex-col gap-3 text-[0.9rem] text-white/70">
              <Link href="/#success-stories" className="hover:text-white transition-colors">
                Success Stories
              </Link>
              <Link href="/#curriculum" className="hover:text-white transition-colors">
                Curriculum
              </Link>
              <Link href="/#faculty" className="hover:text-white transition-colors">
                Faculty
              </Link>
              <Link href="/careers" className="hover:text-white transition-colors">
                Careers
              </Link>
            </div>
          </div>

          {/* Support + Legal */}
          <div>
            <h4 className="text-[0.875rem] font-bold uppercase tracking-[0.05em] text-teal-leg mb-4">
              Supporting
            </h4>
            <div className="flex flex-col gap-3 text-[0.9rem] text-white/70">
              <Link href="/#faq" className="hover:text-white transition-colors">
                FAQ
              </Link>
              <a href="mailto:info@medskillscatalyst.com" className="hover:text-white transition-colors">
                Contact Us
              </a>
              <a
                href="https://wa.me/918800665154"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                WhatsApp Us
              </a>
            </div>
          </div>
        </div>

        {/* Bottom bar — same content as homepage footer-bottom */}
        <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-[0.8rem] text-white/40">
          <span>&copy; {new Date().getFullYear()} MedSkills Catalyst Pvt. Ltd. &middot; Gurgaon, India</span>
          <div className="flex items-center gap-5">
            <a href="/privacy-policy.html" className="hover:text-white/70 transition-colors">
              Privacy Policy
            </a>
            <a href="/terms-of-use.html" className="hover:text-white/70 transition-colors">
              Terms of Use
            </a>
            <a href="/refund-policy.html" className="hover:text-white/70 transition-colors">
              Refund Policy
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
