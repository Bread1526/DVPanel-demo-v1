# **App Name**: DVPanel

## Core Features:

- Role-Based Access Control: User role management interface, including Owner, Administrator, Admin and Custom roles with configurable permissions.
- Project Module: Project management module with isolated runtime environments, resource limits, and template selection, similar to Replit and MCSManager.
- File Manager: Dual file manager system: one for root access (Owner only) and another for project-isolated file management.
- License Verification: Secure license verification system for Pro version features via HTTPS POST to a backend API endpoint.
- Port Manager: Port management tool to view allowed and open ports, with options to kill processes or pause traffic. Generative AI helps recommend port configurations to minimize security risks, acting as a security advisor tool.

## Style Guidelines:

- Dark color scheme. Background color: Dark grey (#111827) to provide a modern, professional look. The choice of a dark scheme ensures less eye strain and better readability, which is useful for developers and administrators.
- Primary color: A saturated blue (#3B82F6) is used as the primary UI color, for interactive elements such as buttons. Its hue is meant to suggest trust and authority, desirable in a control panel context.
- Accent color: A vibrant violet (#7c3aed) complements the primary blue to highlight important actions and status indicators. It has both lower saturation and lower brightness to allow it to contrast the primary. 
- Inter (primary): Consistent use throughout the application for improved readability.
- Consistent UI modeled after modern admin panels. Utilizes modular design for scalability and maintainability.
- Framer Motion for subtle animations on modals and interactive elements.