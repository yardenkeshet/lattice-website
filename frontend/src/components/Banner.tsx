import { Home, Mail } from "lucide-react";
import logoImage from "../../public/logo-tamc.png";
import technionLogo from "../../public/technion-logo.png";
import { Card } from "./ui/card";
import { Link } from "react-router-dom";

const BannerV1 = () => {
  return (
    <header className="bg-technion-blue border-b-4 border-white/10 shadow-lg">
      <div className="container mx-auto px-4 py-4 md:py-6 flex items-center justify-between gap-6">
        {/* 1. Brand Section (Logo + Title) */}
        <Link
          to="/"
          className="flex items-center gap-6 group hover:opacity-90 transition-opacity"
        >
          {/* Logo Wrapper */}
          <div className="hidden sm:flex bg-white p-3 rounded-xl shadow-inner shrink-0">
            <img
              src={logoImage}
              alt="Technion AM Logo"
              className="h-24 w-auto object-contain"
            />
          </div>

          {/* Title Section */}
          <div className="text-white border-l border-white/20 pl-6">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tighter leading-none">
              LATTICE
            </h2>
            <p className="text-lg md:text-xl font-light tracking-widest opacity-80 uppercase">
              Maker
            </p>
          </div>
        </Link>

        {/* 2. Right Side: Partner & Social */}
        <div className="flex items-center gap-8">
          {/* Technion Logo - Hidden on tiny screens */}
          <div className="hidden lg:block border-r border-white/20 pr-8">
            <img
              src={technionLogo}
              alt="Technion Logo"
              className="h-10 w-auto opacity-90 brightness-0 invert"
            />
          </div>

          {/* Navigation/Social Icons */}
          <nav className="flex items-center gap-3">
            {[
              {
                Icon: Home,
                href: "https://tamc.technion.ac.il/",
                label: "Home",
              },
              { Icon: Mail, href: "mailto:contact@technion.ac.il", label: "Contact" },
            ].map(({ Icon, href, label }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="h-10 w-10 flex items-center justify-center rounded-full bg-white/10 border border-white/10 text-white hover:bg-white hover:text-technion-blue transition-all duration-300 shadow-sm"
              >
                <Icon size={20} strokeWidth={1.5} />
              </a>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
};
export default BannerV1;
