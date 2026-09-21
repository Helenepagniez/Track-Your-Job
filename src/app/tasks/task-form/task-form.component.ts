import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NO_COMPANY_LABEL, STATUS_LABELS, currentStatus } from '../../core/models/job-search.models';
import { JobSearchStore } from '../../core/services/job-search-store.service';
import { Task } from '../task.model';

interface ApplicationOption {
    id: number;
    label: string;
    status: string;
}

@Component({
    selector: 'app-task-form',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './task-form.component.html',
    styleUrl: './task-form.component.css'
})
export class TaskFormComponent implements OnInit {
    private store = inject(JobSearchStore);

    @Input() task: Task | null = null;
    @Output() save = new EventEmitter<Partial<Task>>();
    @Output() cancel = new EventEmitter<void>();

    title = signal('');
    dueDate = signal(toInputDate(new Date()));
    priority = signal<Task['priority']>('moyenne');
    status = signal<Task['status']>('a_faire');
    link = signal('');
    linked = signal<number[]>([]);
    searchTerm = signal('');

    readonly priorities: { value: Task['priority'], label: string }[] = [
        { value: 'haute', label: 'Haute' },
        { value: 'moyenne', label: 'Moyenne' },
        { value: 'faible', label: 'Basse' }
    ];

    /** Candidatures de la campagne en cours, cherchables par poste ou entreprise. */
    private options = computed<ApplicationOption[]>(() =>
        this.store.currentApplications().map(application => {
            const company = this.store.company(application.companyId);
            return {
                id: application.id,
                label: `${application.title} — ${company?.name ?? NO_COMPANY_LABEL}`,
                status: STATUS_LABELS[currentStatus(application)]
            };
        })
    );

    suggestions = computed<ApplicationOption[]>(() => {
        const term = this.searchTerm().trim().toLowerCase();
        if (term.length === 0) return [];
        const chosen = this.linked();
        return this.options()
            .filter(option => !chosen.includes(option.id) && option.label.toLowerCase().includes(term))
            .slice(0, 6);
    });

    chosen = computed<ApplicationOption[]>(() => {
        const ids = this.linked();
        return this.options().filter(option => ids.includes(option.id));
    });

    /** Liens que la migration n'a pas su rattacher : affichés tels quels. */
    orphanLabels = signal<string[]>([]);

    ngOnInit(): void {
        const task = this.task;
        if (!task) return;

        this.title.set(task.title);
        this.dueDate.set(toInputDate(new Date(task.dueDate)));
        this.priority.set(task.priority);
        this.status.set(task.status);
        this.link.set(task.link ?? '');
        this.linked.set([...(task.applicationIds ?? [])]);
        this.orphanLabels.set([...(task.relatedOffers ?? [])]);
    }

    add(option: ApplicationOption): void {
        this.linked.update(current => [...current, option.id]);
        this.searchTerm.set('');
    }

    remove(id: number): void {
        this.linked.update(current => current.filter(entry => entry !== id));
    }

    removeOrphan(index: number): void {
        this.orphanLabels.update(current => current.filter((_, position) => position !== index));
    }

    submit(): void {
        const title = this.title().trim();
        if (!title) return;

        const ids = this.linked();
        const orphans = this.orphanLabels();

        this.save.emit({
            title,
            dueDate: new Date(this.dueDate()),
            priority: this.priority(),
            status: this.status(),
            completed: this.status() === 'termine',
            link: this.link().trim() || undefined,
            applicationIds: ids.length > 0 ? ids : undefined,
            relatedOffers: orphans.length > 0 ? orphans : undefined
        });
    }

    onCancel(): void {
        this.cancel.emit();
    }
}

function toInputDate(date: Date): string {
    if (isNaN(date.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
