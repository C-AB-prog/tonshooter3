import React from "react";
import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/", label: "Главная", icon: HomeIcon },
  { to: "/shoot", label: "Стрельба", icon: TargetIcon },
  { to: "/upgrades", label: "Улучшения", icon: UpIcon },
  { to: "/tasks", label: "Задания", icon: CheckIcon },
  { to: "/profile", label: "Профиль", icon: UserIcon },
];

export function BottomNav() {
  return (
    <nav className="bottomNav" aria-label="Навигация">
      <div className="bottomNavInner" role="navigation">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === "/"}
              aria-label={t.label}
              className={({ isActive }) => `navItem ${isActive ? "navItemActive" : ""}`}
            >
              <div className="navIcon" aria-hidden>
                <Icon />
              </div>
              <div className="navLabel">{t.label}</div>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

/* ===================== Icons (inline SVG) ===================== */

function baseProps() {
  return {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
  } as const;
}

function strokeProps() {
  return {
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

function HomeIcon() {
  return (
    <svg {...baseProps()}>
      <path {...strokeProps()} d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5Z" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg {...baseProps()}>
      <path {...strokeProps()} d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10Z" />
      <path {...strokeProps()} d="M12 18a6 6 0 1 0-6-6 6 6 0 0 0 6 6Z" />
      <path {...strokeProps()} d="M12 14a2 2 0 1 0-2-2 2 2 0 0 0 2 2Z" />
      <path {...strokeProps()} d="M19 5l2-2" />
      <path {...strokeProps()} d="M21 7l-2-2" />
    </svg>
  );
}

function UpIcon() {
  return (
    <svg {...baseProps()}>
      <path {...strokeProps()} d="M12 19V5" />
      <path {...strokeProps()} d="M7 10l5-5 5 5" />
      <path {...strokeProps()} d="M5 21h14" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg {...baseProps()}>
      <path {...strokeProps()} d="M9 11.5 11 13.5 15.5 9" />
      <path {...strokeProps()} d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path {...strokeProps()} d="M9 3v2" />
      <path {...strokeProps()} d="M15 3v2" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg {...baseProps()}>
      <path {...strokeProps()} d="M20 21a8 8 0 1 0-16 0" />
      <path {...strokeProps()} d="M12 13a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
    </svg>
  );
}
