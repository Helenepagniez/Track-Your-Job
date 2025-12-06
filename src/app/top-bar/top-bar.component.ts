import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../core/services/auth.service';
import { LayoutService } from '../core/services/layout.service';

@Component({
    selector: 'app-top-bar',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './top-bar.component.html',
    styleUrl: './top-bar.component.css'
})
export class TopBarComponent {
    authService = inject(AuthService);
    layoutService = inject(LayoutService);

    toggleSidebar() {
        this.layoutService.toggleSidebar();
    }
}
