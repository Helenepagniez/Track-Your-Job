import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
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
