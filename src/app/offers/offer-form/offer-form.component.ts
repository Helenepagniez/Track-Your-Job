import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
    APPLICATION_STATUSES,
    ApplicationStatus,
    INTERVIEW_TO_LEGACY,
    InterviewKind,
    LEGACY_TO_INTERVIEW,
    LEGACY_TO_STATUS,
    STATUS_LABELS,
    STATUS_TO_LEGACY
} from '../../core/models/job-search.models';
import { statusClass } from '../../core/models/status-style';
import { JobSearchStore } from '../../core/services/job-search-store.service';
import { JobOffer, NO_COMPANY_LABEL } from '../../core/services/offers.service';

/** Types de contrat pour lesquels une durée a un sens. */
const FIXED_TERM = ['CDD', 'Stage', 'Alternance', 'Freelance', 'Intérim'];

const COMMON_SOURCES = [
    'HelloWork',
    'France Travail',
    'Indeed',
    'LinkedIn',
    'Welcome to the Jungle',
    'Apec',
    'Candidature spontanée',
    'Réseau / contact'
];

/**
 * Saisie d'une candidature, sur un seul écran.
 *
 * Remplace l'assistant en trois étapes : plus rien n'est obligatoire à part
 * l'intitulé du poste, et le contenu de l'annonce est replié par défaut — on
 * ne le remplit que si on en a besoin.
 */
@Component({
    selector: 'app-offer-form',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './offer-form.component.html',
    styleUrl: './offer-form.component.css'
})
export class OfferFormComponent implements OnInit {
    private fb = inject(FormBuilder);
    private store = inject(JobSearchStore);

    @Input() offer: JobOffer | null = null;
    @Output() save = new EventEmitter<Partial<JobOffer>>();
    @Output() cancel = new EventEmitter<void>();

    isEditing = signal(false);

    readonly statuses = APPLICATION_STATUSES;
    readonly statusLabels = STATUS_LABELS;
    readonly sources = COMMON_SOURCES;
    readonly contractTypes = ['CDI', 'CDD', 'Alternance', 'Stage', 'Freelance', 'Intérim'];
    readonly interviewKinds: { value: InterviewKind, label: string }[] = [
        { value: 'prequal', label: 'Préqualification' },
        { value: 'phone', label: 'Téléphone' },
        { value: 'video', label: 'Visio' },
        { value: 'onsite', label: 'Sur place' }
    ];

    statusClass = statusClass;

    companyNames = computed(() =>
        [...this.store.companies()].map(company => company.name).sort((a, b) => a.localeCompare(b, 'fr'))
    );

    form = this.fb.nonNullable.group({
        link: [''],
        title: ['', Validators.required],
        company: [''],
        anonymous: [false],
        agencyName: [''],
        location: [''],
        contractType: [''],
        contractDuration: [''],
        weeklyHours: [''],
        salary: [''],
        source: [''],
        status: ['to_apply' as ApplicationStatus],
        interviewDate: [''],
        interviewKind: ['video' as InterviewKind],
        description: [''],
        missions: [''],
        profile: [''],
        benefits: [''],
        recruitmentProcess: [''],
        others: ['']
    });

    ngOnInit(): void {
        const offer = this.offer;
        if (!offer) return;

        this.isEditing.set(true);
        const anonymous = offer.company === NO_COMPANY_LABEL;

        this.form.patchValue({
            link: offer.link ?? '',
            title: offer.title,
            company: anonymous ? '' : offer.company,
            anonymous,
            agencyName: offer.agencyName ?? '',
            location: offer.location ?? '',
            contractType: offer.contractType ?? '',
            contractDuration: offer.contractDuration ?? '',
            weeklyHours: offer.weeklyHours ?? '',
            salary: offer.salary ?? '',
            source: offer.source ?? '',
            status: LEGACY_TO_STATUS[offer.status] ?? 'to_apply',
            interviewDate: toInputValue(offer.interviewDate),
            interviewKind: offer.interviewType ? LEGACY_TO_INTERVIEW[offer.interviewType] : 'video',
            description: offer.description ?? '',
            missions: offer.missions ?? '',
            profile: offer.profile ?? '',
            benefits: offer.benefits ?? '',
            recruitmentProcess: offer.recruitmentProcess ?? '',
            others: offer.others ?? ''
        });
    }

    get anonymous(): boolean {
        return this.form.controls.anonymous.value;
    }

    get status(): ApplicationStatus {
        return this.form.controls.status.value;
    }

    get needsDuration(): boolean {
        return FIXED_TERM.includes(this.form.controls.contractType.value);
    }

    get hasContent(): boolean {
        const { description, missions, profile, benefits, recruitmentProcess, others } = this.form.getRawValue();
        return [description, missions, profile, benefits, recruitmentProcess, others].some(value => !!value.trim());
    }

    setStatus(status: ApplicationStatus): void {
        this.form.controls.status.setValue(status);
    }

    toggleAnonymous(): void {
        const next = !this.anonymous;
        this.form.controls.anonymous.setValue(next);
        if (next) {
            this.form.controls.company.setValue('');
        } else {
            this.form.controls.agencyName.setValue('');
        }
    }

    submit(): void {
        if (this.form.invalid) {
            this.form.controls.title.markAsTouched();
            return;
        }

        const value = this.form.getRawValue();
        const anonymous = value.anonymous;
        const wantsInterview = value.status === 'interview' && !!value.interviewDate;

        this.save.emit({
            title: value.title.trim(),
            company: anonymous ? NO_COMPANY_LABEL : value.company.trim(),
            agencyName: anonymous ? blankToUndefined(value.agencyName) : undefined,
            location: value.location.trim(),
            contractType: blankToUndefined(value.contractType),
            contractDuration: this.needsDuration ? blankToUndefined(value.contractDuration) : undefined,
            weeklyHours: blankToUndefined(value.weeklyHours),
            salary: blankToUndefined(value.salary),
            source: blankToUndefined(value.source),
            link: blankToUndefined(value.link),
            status: STATUS_TO_LEGACY[value.status],
            statusValue: value.status,
            description: blankToUndefined(value.description),
            missions: blankToUndefined(value.missions),
            profile: blankToUndefined(value.profile),
            benefits: blankToUndefined(value.benefits),
            recruitmentProcess: blankToUndefined(value.recruitmentProcess),
            others: blankToUndefined(value.others),
            interviewDate: wantsInterview ? new Date(value.interviewDate) : undefined,
            interviewType: wantsInterview ? INTERVIEW_TO_LEGACY[value.interviewKind] : undefined
        });
    }

    onCancel(): void {
        this.cancel.emit();
    }
}

// --------------------------------------------------------------------------

function blankToUndefined(value: string): string | undefined {
    const trimmed = (value ?? '').trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

/** Date au format attendu par `<input type="datetime-local">`. */
function toInputValue(date?: Date): string {
    if (!date) return '';
    const value = new Date(date);
    if (isNaN(value.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
        + `T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}
