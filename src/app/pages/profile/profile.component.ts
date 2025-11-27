import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
    selector: 'app-profile',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './profile.component.html',
    styleUrl: './profile.component.css'
})
export class ProfileComponent implements OnInit {
    user = {
        firstName: '',
        lastName: '',
        email: '',
        title: 'Développeur Full Stack',
        location: 'Paris, France',
        bio: 'Passionné par Angular et le développement web moderne.',
        skills: ['Angular', 'TypeScript', 'Node.js', 'CSS']
    };

    isEditing = false;

    constructor(private authService: AuthService) { }

    ngOnInit() {
        const currentUser = this.authService.currentUser();
        if (currentUser) {
            const nameParts = currentUser.fullName.split(' ');
            this.user.firstName = nameParts[0] || '';
            this.user.lastName = nameParts.slice(1).join(' ') || '';
            this.user.email = currentUser.email;

            if (currentUser.title) this.user.title = currentUser.title;
            if (currentUser.location) this.user.location = currentUser.location;
            if (currentUser.bio) this.user.bio = currentUser.bio;
            if (currentUser.skills) this.user.skills = currentUser.skills;
        }
    }

    toggleEdit() {
        this.isEditing = !this.isEditing;
    }

    saveProfile() {
        this.isEditing = false;
        const fullName = `${this.user.firstName} ${this.user.lastName}`.trim();

        this.authService.updateUserProfile({
            fullName,
            title: this.user.title,
            location: this.user.location,
            bio: this.user.bio,
            skills: this.user.skills
        });
    }
}
