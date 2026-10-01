import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Ticket, Box, Building2, BarChart3, Users,
  ChevronDown, ChevronRight, UserPlus, ListChecks, PlusCircle,
} from "lucide-react";
import synovLogo from "../assets/synov_it_services_pvt_ltd_logo.jpg";
import { useAuth } from "../context/useAuth";

const staffNavItems = [
  { name: "Dashboard", path: "/", icon: LayoutDashboard, roles: ["it_staff", "admin"] },
  { name: "Tickets", path: "/tickets", icon: Ticket, roles: ["it_staff", "admin"] },
  { name: "Assets", path: "/assets", icon: Box, roles: ["it_staff", "admin"] },
  { name: "Customer List", path: "/customers", icon: Building2, roles: ["it_staff", "admin"] },
  { name: "Technicians", path: "/technicians", icon: Users, roles: ["admin"] },
  { name: "Add Client User", path: "/client-users/add", icon: UserPlus, roles: ["admin"] },
  { name: "Reports", path: "/reports", icon: BarChart3, roles: ["admin"] },
];

function NavItem({ to, icon: Icon, label, indent }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 whitespace-nowrap px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          indent ? "ml-3" : ""
        } ${isActive ? "bg-brand-purple text-white" : "text-text-primary hover:bg-surface-page"}`
      }
    >
      {Icon && <Icon size={16} />}
      {label}
    </NavLink>
  );
}

function CollapsibleSection({ label, icon: Icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-text-primary hover:bg-surface-page transition-colors"
      >
        <span className="flex items-center gap-3 whitespace-nowrap">
          <Icon size={18} />
          {label}
        </span>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {open && <div className="mt-1 space-y-1">{children}</div>}
    </div>
  );
}

export default function Sidebar() {
  const { role, isCompanyAdmin } = useAuth();
  const sidebarWidth = role === "client" ? "w-64" : "w-44";

  return (
    <div className={`sticky top-0 h-screen ${sidebarWidth} shrink-0 bg-surface-card flex flex-col`}>
      <div className="px-4 py-6">
        <img src={synovLogo} alt="Synov IT Services" className="h-20" />
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {role === "client" ? (
          <>
            <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />
            <NavItem to="/assets" icon={Box} label="Asset Management" />

            {isCompanyAdmin && (
              <CollapsibleSection label="User Management" icon={Users}>
                <NavItem to="/users/add" icon={UserPlus} label="Add User" indent />
                <NavItem to="/users" icon={ListChecks} label="User List" indent />
              </CollapsibleSection>
            )}

            <CollapsibleSection label="Ticket Management" icon={Ticket}>
              <NavItem to="/raise-ticket" icon={PlusCircle} label="New Ticket" indent />
              <NavItem to="/tickets" icon={ListChecks} label="Tickets List" indent />
            </CollapsibleSection>
          </>
        ) : (
          staffNavItems
            .filter((item) => !role || item.roles.includes(role))
            .map((item) => (
              <NavItem key={item.path} to={item.path} icon={item.icon} label={item.name} />
            ))
        )}
      </nav>

    </div>
  );
}