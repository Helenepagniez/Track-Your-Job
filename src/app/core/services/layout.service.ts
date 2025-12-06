import { Injectable, signal } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class LayoutService {
    isSidebarCollapsed = signal<boolean>(false);

    toggleSidebar() {
        this.isSidebarCollapsed.update(v => !v);
    }

    setSidebarCollapsed(collapsed: boolean) {
        this.isSidebarCollapsed.set(collapsed);
    }

    closeSidebar() {
        if (window.innerWidth <= 768) {
            this.isSidebarCollapsed.set(false);
        }
    }
}
