import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
    selector: 'app-register',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    templateUrl: './register.component.html',
    styleUrl: './register.component.css'
})
export class RegisterComponent {
    private router = inject(Router);
    private authService = inject(AuthService);

    fullName = signal('');
    email = signal('');
    password = signal('');
    confirmPassword = signal('');
    error = signal('');
    busy = signal(false);

    get canSubmit(): boolean {
        return !this.busy()
            && !!this.fullName().trim()
            && !!this.email().trim()
            && this.password().length > 0;
    }

    async withGoogle(): Promise<void> {
        this.error.set('');
        this.busy.set(true);
        const result = await this.authService.loginWithGoogle();
        this.busy.set(false);

        if (result.ok) {
            await this.router.navigate(['/resume']);
        } else {
            this.error.set(result.error ?? 'Inscription impossible.');
        }
    }

    async submit(): Promise<void> {
        this.error.set('');

        if (this.password().length < 6) {
            this.error.set('Le mot de passe doit faire au moins 6 caractères.');
            return;
        }
        if (this.password() !== this.confirmPassword()) {
            this.error.set('Les deux mots de passe ne correspondent pas.');
            return;
        }

        this.busy.set(true);
        const result = await this.authService.register(
            this.fullName().trim(),
            this.email().trim(),
            this.password()
        );
        this.busy.set(false);

        if (result.ok) {
            await this.router.navigate(['/resume']);
        } else {
            this.error.set(result.error ?? 'Inscription impossible.');
        }
    }
}
