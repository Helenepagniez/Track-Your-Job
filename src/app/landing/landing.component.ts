import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../core/services/auth.service';

@Component({
    selector: 'app-landing',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './landing.component.html',
    styleUrl: './landing.component.css'
})
export class LandingComponent implements OnInit {
    private authService = inject(AuthService);
    private router = inject(Router);

    /** On attend la réponse de Firebase : sinon on redirige à tort. */
    async ngOnInit(): Promise<void> {
        await this.authService.whenReady();
        if (this.authService.isAuthenticated()) {
            await this.router.navigate(['/resume']);
        }
    }
}
