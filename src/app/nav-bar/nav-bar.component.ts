import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { LayoutService } from '../core/services/layout.service';
import { ThemeService } from '../core/services/theme.service';

@Component({
    selector: 'app-nav-bar',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './nav-bar.component.html',
    styleUrl: './nav-bar.component.css'
})
export class NavBarComponent {
    authService = inject(AuthService);
    themeService = inject(ThemeService);
    layoutService = inject(LayoutService);

    logout() {
        this.authService.logout();
    }

    closeSidebar() {
        this.layoutService.closeSidebar();
    }
}
