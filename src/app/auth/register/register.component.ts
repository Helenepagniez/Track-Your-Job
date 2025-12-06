import { Component } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
    selector: 'app-register',
    standalone: true,
    imports: [CommonModule, RouterLink, FormsModule],
    templateUrl: './register.component.html',
    styleUrl: './register.component.css'
})
export class RegisterComponent {
    fullName = '';
    email = '';
    password = '';
    confirmPassword = '';

    constructor(
        private router: Router,
        private authService: AuthService
    ) { }

    onSubmit() {
        if (this.password !== this.confirmPassword) {
            alert('Les mots de passe ne correspondent pas');
            return;
        }

        if (this.authService.register(this.fullName, this.email, this.password)) {
            this.router.navigate(['/resume']);
        }
    }

    registerWithGoogle() {
        if (this.authService.loginWithGoogle()) {
            this.router.navigate(['/resume']);
        }
    }
}
