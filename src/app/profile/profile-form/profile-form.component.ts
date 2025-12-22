import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-profile-form',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './profile-form.component.html',
    styleUrls: ['./profile-form.component.css']
})
export class ProfileFormComponent implements OnChanges {
    @Input() user: any;
    @Output() save = new EventEmitter<any>();
    @Output() cancel = new EventEmitter<void>();

    formData: any = {};

    // Password change specific fields
    showPasswordChange = false;
    newPassword = '';
    confirmNewPassword = '';
    showNewPassword = false;
    showConfirmNewPassword = false;

    ngOnChanges(changes: SimpleChanges) {
        if (changes['user'] && this.user) {
            this.formData = { ...this.user };
            // Reset password fields when user changes or form opens
            this.resetPasswordFields();
        }
    }

    resetPasswordFields() {
        this.showPasswordChange = false;
        this.newPassword = '';
        this.confirmNewPassword = '';
        this.showNewPassword = false;
        this.showConfirmNewPassword = false;
    }

    togglePasswordChange() {
        this.showPasswordChange = !this.showPasswordChange;
        if (!this.showPasswordChange) {
            this.newPassword = '';
            this.confirmNewPassword = '';
        }
    }

    toggleNewPasswordVisibility() {
        this.showNewPassword = !this.showNewPassword;
    }

    toggleConfirmNewPasswordVisibility() {
        this.showConfirmNewPassword = !this.showConfirmNewPassword;
    }

    onSubmit() {
        // If password change is requested, validate passwords
        if (this.showPasswordChange) {
            if (this.newPassword && this.newPassword !== this.confirmNewPassword) {
                alert('Les mots de passe ne correspondent pas');
                return;
            }

            // Only add password if it's been filled
            if (this.newPassword) {
                this.formData.password = this.newPassword;
            }
        }

        this.save.emit(this.formData);
    }

    onCancel() {
        this.resetPasswordFields();
        this.cancel.emit();
    }
}
