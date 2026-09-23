import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import {
    APPLICATION_STATUSES,
    Application,
    ApplicationStatus,
    InterviewKind,
    STATUS_LABELS,
    currentStatus,
    interviewEvents
} from '../../core/models/job-search.models';
import { statusClass } from '../../core/models/status-style';
import { ParsedOffer, parseJobOffer, parsedFields, sourceFromLink } from '../../core/parsing/job-offer-parser';
import { ApplicationDraft, JobSearchStore } from '../../core/services/job-search-store.service';
import { OfferLookupService } from '../../core/services/offer-lookup.service';

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
 * l'intitulé du poste, et le contenu de l'annonce est replié par défaut.
 */
@Component({
    selector: 'app-offer-form',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule],
    templateUrl: './offer-form.component.html',
    styleUrl: './offer-form.component.css'
})
export class OfferFormComponent implements OnInit {
    private fb = inject(FormBuilder);
    private store = inject(JobSearchStore);
    private lookup = inject(OfferLookupService);

    @Input() application: Application | null = null;
    @Output() save = new EventEmitter<ApplicationDraft>();
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

    // -------------------------------------------------- collage d'annonce

    showPaste = signal(false);
    pasted = signal('');
    /** Champs remplis par le dernier collage, pour le dire et pouvoir annuler. */
    pasteFilled = signal<string[]>([]);
    pasteSkipped = signal<string[]>([]);
    pasteEmpty = signal(false);

    /** Lecture en cours de l'annonce depuis son lien. */
    reading = signal(false);
    readError = signal('');

    companyNames = computed(() =>
        this.store.companies().map(company => company.name).sort((a, b) => a.localeCompare(b, 'fr'))
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
        const application = this.application;
        if (!application) return;

        this.isEditing.set(true);
        const company = this.store.company(application.companyId);
        const anonymous = application.companyId === null;
        const nextInterview = interviewEvents(application)
            .find(event => new Date(event.at) >= new Date());

        this.form.patchValue({
            link: application.link ?? '',
            title: application.title,
            company: company?.name ?? '',
            anonymous,
            agencyName: application.agencyName ?? '',
            location: application.location ?? '',
            contractType: application.contractType ?? '',
            contractDuration: application.contractDuration ?? '',
            weeklyHours: application.weeklyHours ?? '',
            salary: application.salary ?? '',
            source: application.source ?? '',
            status: currentStatus(application),
            interviewDate: nextInterview ? toInputValue(new Date(nextInterview.at)) : '',
            interviewKind: nextInterview?.interviewKind ?? 'video',
            description: application.posting?.description ?? '',
            missions: application.posting?.missions ?? '',
            profile: application.posting?.profile ?? '',
            benefits: application.posting?.benefits ?? '',
            recruitmentProcess: application.posting?.recruitmentProcess ?? '',
            others: application.posting?.others ?? ''
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

    openPaste(): void {
        this.pasted.set('');
        this.pasteFilled.set([]);
        this.pasteSkipped.set([]);
        this.pasteEmpty.set(false);
        this.showPaste.set(true);
    }

    closePaste(): void {
        this.showPaste.set(false);
    }

    /**
     * Remplit les champs vides à partir de l'annonce collée. Ce qui est déjà
     * saisi n'est jamais écrasé : c'est une aide, pas une reprise en main.
     */
    applyPaste(): void {
        const offer = parseJobOffer(this.pasted());

        if (parsedFields(offer).length === 0) {
            this.pasteEmpty.set(true);
            this.pasteFilled.set([]);
            this.pasteSkipped.set([]);
            return;
        }

        this.fill(offer);
        if (this.pasteFilled().length > 0) this.showPaste.set(false);
    }

    /**
     * Demande au serveur de lire l'annonce : le navigateur n'a pas le droit
     * d'aller chercher la page d'un autre site.
     */
    async readFromLink(): Promise<void> {
        const link = this.form.controls.link.value.trim();
        if (!link || this.reading()) return;

        this.reading.set(true);
        this.readError.set('');
        this.pasteEmpty.set(false);

        const outcome = await this.lookup.read(link);
        this.reading.set(false);

        if (!outcome.ok || !outcome.offer) {
            this.readError.set(outcome.message ?? 'La lecture a échoué.');
            return;
        }

        this.fill(outcome.offer);

        if (this.pasteFilled().length === 0) {
            this.readError.set(outcome.message
                ?? "L'annonce n'a rien livré de neuf. Collez son texte pour aller plus loin.");
        } else if (outcome.message) {
            this.readError.set(outcome.message);
        }
    }

    /** Recopie dans le formulaire, sans jamais écraser ce qui est déjà saisi. */
    private fill(offer: ParsedOffer): void {
        const filled: string[] = [];
        const skipped: string[] = [];

        const put = (control: keyof typeof this.form.controls, value: string | undefined, label: string) => {
            if (!value) return;
            const field = this.form.controls[control];
            const current = String(field.value ?? '').trim();
            if (current) {
                if (current !== value) skipped.push(label);
                return;
            }
            field.setValue(value as never);
            filled.push(label);
        };

        put('title', offer.title, 'intitulé');
        put('location', offer.location, 'lieu');
        put('contractType', offer.contractType, 'contrat');
        put('contractDuration', offer.contractDuration, 'durée');
        put('weeklyHours', offer.weeklyHours, 'temps de travail');
        put('salary', offer.salary, 'salaire');
        put('source', offer.source, 'source');
        put('link', offer.link, 'lien');

        // L'employeur : soit on le nomme, soit l'annonce ne le nomme pas.
        if (offer.employerNotNamed && !this.anonymous && !this.form.controls.company.value.trim()) {
            this.form.controls.anonymous.setValue(true);
            filled.push('employeur non communiqué');
        }
        if (this.anonymous) {
            put('agencyName', offer.agencyName, 'agence');
        } else {
            put('company', offer.companyName, 'entreprise');
        }

        put('description', offer.posting?.description, 'description');
        put('missions', offer.posting?.missions, 'missions');
        put('profile', offer.posting?.profile, 'profil');
        put('benefits', offer.posting?.benefits, 'avantages');
        put('recruitmentProcess', offer.posting?.recruitmentProcess, 'process');
        put('others', offer.posting?.others, 'autres');

        this.pasteFilled.set(filled);
        this.pasteSkipped.set(skipped);
    }

    /** Déduit la source quand on sort du champ du lien, s'il est vide. */
    onLinkBlur(): void {
        const link = this.form.controls.link.value.trim();
        if (!link || this.form.controls.source.value.trim()) return;

        const source = sourceFromLink(link);
        if (source) this.form.controls.source.setValue(source);
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
        const wantsInterview = value.status === 'interview' && !!value.interviewDate;

        const posting = {
            description: blank(value.description),
            missions: blank(value.missions),
            profile: blank(value.profile),
            benefits: blank(value.benefits),
            recruitmentProcess: blank(value.recruitmentProcess),
            others: blank(value.others)
        };

        this.save.emit({
            title: value.title.trim(),
            companyName: value.anonymous ? '' : value.company.trim(),
            agencyName: value.anonymous ? blank(value.agencyName) : undefined,
            location: blank(value.location),
            contractType: blank(value.contractType),
            contractDuration: this.needsDuration ? blank(value.contractDuration) : undefined,
            weeklyHours: blank(value.weeklyHours),
            salary: blank(value.salary),
            source: blank(value.source),
            link: blank(value.link),
            posting: Object.values(posting).some(entry => !!entry) ? posting : undefined,
            status: value.status,
            interviewAt: wantsInterview ? new Date(value.interviewDate).toISOString() : undefined,
            interviewKind: wantsInterview ? value.interviewKind : undefined
        });
    }

    onCancel(): void {
        this.cancel.emit();
    }
}

// --------------------------------------------------------------------------

function blank(value: string): string | undefined {
    const trimmed = (value ?? '').trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

/** Date au format attendu par `<input type="datetime-local">`. */
function toInputValue(date: Date): string {
    if (isNaN(date.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
        + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
