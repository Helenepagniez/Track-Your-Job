import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Profile } from '../../core/models/job-search.models';

export interface ProfileDraft {
    fullName: string;
    email: string;
    title?: string;
    location?: string;
    phone?: string;
    availability?: string;
    searchZone?: string;
    targetRoles?: string[];
    contractTypes?: string[];
    skills?: string[];
    salaryExpectation?: string;
    linkedin?: string;
    portfolio?: string;
    /** Renseigné uniquement si l'utilisateur change son mot de passe. */
    newPassword?: string;
}

const CONTRACT_TYPES = ['CDI', 'CDD', 'Alternance', 'Stage', 'Freelance', 'Intérim'];

const AVAILABILITIES = [
    'Immédiatement',
    'Sous 1 mois',
    'Sous 3 mois',
    'À partir d\'une date précise'
];

@Component({
    selector: 'app-profile-form',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './profile-form.component.html',
    styleUrls: ['./profile-form.component.css']
})
export class ProfileFormComponent implements OnInit {
    private fb = inject(FormBuilder);

    @Input() profile: Profile | null = null;
    @Output() save = new EventEmitter<ProfileDraft>();
    @Output() cancel = new EventEmitter<void>();

    readonly contractTypes = CONTRACT_TYPES;
    readonly availabilities = AVAILABILITIES;

    selectedContracts = signal<string[]>([]);

    showPasswordChange = signal(false);
    passwordError = signal('');

    form = this.fb.nonNullable.group({
        fullName: ['', Validators.required],
        email: ['', [Validators.required, Validators.email]],
        title: [''],
        location: [''],
        phone: [''],
        availability: [''],
        searchZone: [''],
        targetRoles: [''],
        skills: [''],
        salaryExpectation: [''],
        linkedin: [''],
        portfolio: [''],
        newPassword: [''],
        confirmPassword: ['']
    });

    ngOnInit(): void {
        const profile = this.profile;
        if (!profile) return;

        this.selectedContracts.set([...(profile.contractTypes ?? [])]);
        this.form.patchValue({
            fullName: profile.fullName,
            email: profile.email,
            title: profile.title ?? '',
            location: profile.location ?? '',
            phone: profile.phone ?? '',
            availability: profile.availability ?? '',
            searchZone: profile.searchZone ?? '',
            targetRoles: (profile.targetRoles ?? []).join(', '),
            skills: (profile.skills ?? []).join(', '),
            salaryExpectation: profile.salaryExpectation ?? '',
            linkedin: profile.linkedin ?? '',
            portfolio: profile.portfolio ?? ''
        });
    }

    toggleContract(type: string): void {
        this.selectedContracts.update(current =>
            current.includes(type)
                ? current.filter(entry => entry !== type)
                : [...current, type]
        );
    }

    isContractSelected(type: string): boolean {
        return this.selectedContracts().includes(type);
    }

    togglePasswordChange(): void {
        this.showPasswordChange.update(shown => !shown);
        this.passwordError.set('');
        this.form.patchValue({ newPassword: '', confirmPassword: '' });
    }

    submit(): void {
        this.passwordError.set('');

        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        const value = this.form.getRawValue();

        if (this.showPasswordChange()) {
            if (value.newPassword.length < 6) {
                this.passwordError.set('Le mot de passe doit faire au moins 6 caractères.');
                return;
            }
            if (value.newPassword !== value.confirmPassword) {
                this.passwordError.set('Les deux mots de passe ne correspondent pas.');
                return;
            }
        }

        this.save.emit({
            fullName: value.fullName.trim(),
            email: value.email.trim(),
            title: blank(value.title),
            location: blank(value.location),
            phone: blank(value.phone),
            availability: blank(value.availability),
            searchZone: blank(value.searchZone),
            targetRoles: list(value.targetRoles),
            contractTypes: this.selectedContracts().length > 0 ? this.selectedContracts() : undefined,
            skills: list(value.skills),
            salaryExpectation: blank(value.salaryExpectation),
            linkedin: blank(value.linkedin),
            portfolio: blank(value.portfolio),
            newPassword: this.showPasswordChange() ? value.newPassword : undefined
        });
    }

    onCancel(): void {
        this.cancel.emit();
    }
}

function blank(value: string): string | undefined {
    const trimmed = (value ?? '').trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function list(value: string): string[] | undefined {
    const entries = (value ?? '')
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean);
    return entries.length > 0 ? entries : undefined;
}
