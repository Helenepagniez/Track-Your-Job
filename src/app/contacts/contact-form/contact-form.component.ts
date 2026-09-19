import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Contact } from '../../core/models/job-search.models';
import { JobSearchStore } from '../../core/services/job-search-store.service';

/** Ce que le formulaire renvoie ; l'écran appelant s'occupe d'écrire. */
export interface ContactDraft {
    fullName: string;
    role?: string;
    email?: string;
    phone?: string;
    linkedin?: string;
    notes?: string;
    /** Nom de l'entreprise actuelle, vide si aucune. */
    companyName: string;
}

@Component({
    selector: 'app-contact-form',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './contact-form.component.html',
    styleUrl: './contact-form.component.css'
})
export class ContactFormComponent implements OnInit {
    private fb = inject(FormBuilder);
    private store = inject(JobSearchStore);

    @Input() contact: Contact | null = null;
    /** Pré-remplit l'entreprise quand on ajoute depuis une fiche entreprise. */
    @Input() companyName = '';
    @Output() save = new EventEmitter<ContactDraft>();
    @Output() cancel = new EventEmitter<void>();

    isEditing = signal(false);

    companyNames = computed(() =>
        this.store.companies().map(company => company.name).sort((a, b) => a.localeCompare(b, 'fr'))
    );

    form = this.fb.nonNullable.group({
        fullName: ['', Validators.required],
        role: [''],
        companyName: [''],
        email: ['', Validators.email],
        phone: [''],
        linkedin: [''],
        notes: ['']
    });

    ngOnInit(): void {
        if (this.companyName) {
            this.form.controls.companyName.setValue(this.companyName);
        }

        const contact = this.contact;
        if (!contact) return;

        this.isEditing.set(true);
        const current = contact.affiliations.find(affiliation => affiliation.current)
            ?? contact.affiliations[0];
        const company = current ? this.store.company(current.companyId) : undefined;

        this.form.patchValue({
            fullName: contact.fullName,
            role: contact.role ?? '',
            companyName: company?.name ?? '',
            email: contact.email ?? '',
            phone: contact.phone ?? '',
            linkedin: contact.linkedin ?? '',
            notes: contact.notes ?? ''
        });
    }

    submit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        const value = this.form.getRawValue();
        this.save.emit({
            fullName: value.fullName.trim(),
            role: blank(value.role),
            email: blank(value.email),
            phone: blank(value.phone),
            linkedin: blank(value.linkedin),
            notes: blank(value.notes),
            companyName: value.companyName.trim()
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
