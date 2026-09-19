import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Company } from '../../core/models/job-search.models';

export interface CompanyDraft {
    name: string;
    sector?: string;
    website?: string;
    employees?: number;
    founded?: number;
    group?: string;
    description?: string;
    notes?: string;
    tags?: string[];
}

/** Secteurs proposés ; le champ reste libre. */
const SECTORS = [
    'Média · Internet · Communication',
    'Informatique · ESN',
    'Banque · Assurance',
    'Immobilier · Construction',
    'Industrie',
    'Santé · Social',
    'Enseignement · Formation',
    'Commerce · Distribution',
    'Transport · Logistique',
    'Énergie · Environnement',
    'Conseil · Audit',
    'Administration · Collectivité',
    'Associatif',
    'Autre'
];

/**
 * La fiche entreprise est le seul endroit où ces informations sont saisies.
 * Les contacts, eux, vivent dans le répertoire.
 */
@Component({
    selector: 'app-company-form',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './company-form.component.html',
    styleUrl: './company-form.component.css'
})
export class CompanyFormComponent implements OnInit {
    private fb = inject(FormBuilder);

    @Input() company: Company | null = null;
    /** Le nom n'est modifiable qu'à la création : il sert de repère partout. */
    @Input() lockName = false;
    @Output() save = new EventEmitter<CompanyDraft>();
    @Output() cancel = new EventEmitter<void>();

    isEditing = signal(false);
    readonly sectors = SECTORS;

    form = this.fb.nonNullable.group({
        name: ['', Validators.required],
        sector: [''],
        website: [''],
        employees: [''],
        founded: [''],
        group: [''],
        description: [''],
        notes: [''],
        tags: ['']
    });

    ngOnInit(): void {
        const company = this.company;
        if (!company) return;

        this.isEditing.set(true);
        this.form.patchValue({
            name: company.name,
            sector: company.sector ?? '',
            website: company.website ?? '',
            employees: company.employees !== undefined ? String(company.employees) : '',
            founded: company.founded !== undefined ? String(company.founded) : '',
            group: company.group ?? '',
            description: company.description ?? '',
            notes: company.notes ?? '',
            tags: (company.tags ?? []).join(', ')
        });

        if (this.lockName) {
            this.form.controls.name.disable();
        }
    }

    submit(): void {
        if (this.form.invalid) {
            this.form.controls.name.markAsTouched();
            return;
        }

        const value = this.form.getRawValue();
        const tags = value.tags
            .split(',')
            .map(tag => tag.trim())
            .filter(Boolean);

        this.save.emit({
            name: value.name.trim(),
            sector: blank(value.sector),
            website: blank(value.website),
            employees: numberOr(value.employees),
            founded: numberOr(value.founded),
            group: blank(value.group),
            description: blank(value.description),
            notes: blank(value.notes),
            tags: tags.length > 0 ? tags : undefined
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

function numberOr(value: string): number | undefined {
    const trimmed = (value ?? '').trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return isNaN(parsed) ? undefined : parsed;
}
