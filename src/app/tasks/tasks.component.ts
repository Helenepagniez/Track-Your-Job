import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { NO_COMPANY_LABEL } from '../core/models/job-search.models';
import { JobSearchStore } from '../core/services/job-search-store.service';
import { TasksService } from '../core/services/tasks.service';
import { TaskFormComponent } from './task-form/task-form.component';
import { Task } from './task.model';

type Column = 'a_faire' | 'en_cours' | 'termine';

interface LinkedApplication {
    id: number;
    label: string;
}

interface TaskCard {
    task: Task;
    /** Candidatures rattachées par identifiant, résolues à l'affichage. */
    links: LinkedApplication[];
    /** Libellés hérités que la migration n'a pas su rattacher. */
    orphans: string[];
    dueLabel: string;
    overdue: boolean;
    dueToday: boolean;
}

interface TaskColumn {
    key: Column;
    label: string;
    cards: TaskCard[];
}

const COLUMNS: { key: Column; label: string }[] = [
    { key: 'a_faire', label: 'À faire' },
    { key: 'en_cours', label: 'En cours' },
    { key: 'termine', label: 'Terminé' }
];

@Component({
    selector: 'app-tasks',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, DragDropModule, TaskFormComponent],
    templateUrl: './tasks.component.html',
    styleUrl: './tasks.component.css'
})
export class TasksComponent {
    private tasksService = inject(TasksService);
    private store = inject(JobSearchStore);

    readonly columnDefs = COLUMNS;

    view = signal<'board' | 'list'>('board');
    searchTerm = signal('');
    priorityFilter = signal<Task['priority'] | ''>('');
    onlyOverdue = signal(false);

    showFormModal = signal(false);
    editing = signal<Task | null>(null);
    showDeleteConfirm = signal(false);
    toDelete = signal<number | null>(null);

    private cards = computed<TaskCard[]>(() =>
        this.tasksService.tasks()
            .map(task => this.toCard(task))
            .sort((a, b) => new Date(a.task.dueDate).getTime() - new Date(b.task.dueDate).getTime())
    );

    filtered = computed<TaskCard[]>(() => {
        const term = this.searchTerm().trim().toLowerCase();
        const priority = this.priorityFilter();
        const overdue = this.onlyOverdue();

        return this.cards().filter(card => {
            if (priority && card.task.priority !== priority) return false;
            if (overdue && !card.overdue) return false;
            if (!term) return true;
            return card.task.title.toLowerCase().includes(term)
                || card.links.some(link => link.label.toLowerCase().includes(term));
        });
    });

    columns = computed<TaskColumn[]>(() =>
        COLUMNS.map(definition => ({
            key: definition.key,
            label: definition.label,
            cards: this.filtered().filter(card => card.task.status === definition.key)
        }))
    );

    total = computed(() => this.cards().length);
    overdueCount = computed(() => this.cards().filter(card => card.overdue).length);
    remaining = computed(() => this.cards().filter(card => !card.task.completed).length);

    hasFilters = computed(() =>
        !!this.searchTerm() || !!this.priorityFilter() || this.onlyOverdue()
    );

    // --------------------------------------------------------------- actions

    /** Déplacer une carte change sa colonne, et rien d'autre. */
    onDropped(event: CdkDragDrop<TaskColumn>, target: TaskColumn): void {
        const card = event.item.data as TaskCard;
        if (card.task.status === target.key) return;
        this.tasksService.updateTaskStatus(card.task.id, target.key);
    }

    toggle(card: TaskCard): void {
        this.tasksService.toggleTask(card.task.id);
    }

    openForm(card?: TaskCard): void {
        this.editing.set(card?.task ?? null);
        this.showFormModal.set(true);
    }

    closeForm(): void {
        this.showFormModal.set(false);
        this.editing.set(null);
    }

    onSave(data: Partial<Task>): void {
        const editing = this.editing();

        if (editing) {
            this.tasksService.updateTask({ ...editing, ...data } as Task);
        } else {
            this.tasksService.addTask({
                id: Date.now(),
                title: data.title ?? 'Tâche sans titre',
                dueDate: data.dueDate ?? new Date(),
                completed: data.completed ?? false,
                status: data.status ?? 'a_faire',
                priority: data.priority ?? 'moyenne',
                link: data.link,
                applicationIds: data.applicationIds,
                relatedOffers: data.relatedOffers,
                campaignId: this.store.activeCampaign()?.id
            });
        }
        this.closeForm();
    }

    askDelete(card: TaskCard): void {
        this.toDelete.set(card.task.id);
        this.showDeleteConfirm.set(true);
    }

    cancelDelete(): void {
        this.showDeleteConfirm.set(false);
        this.toDelete.set(null);
    }

    confirmDelete(): void {
        const id = this.toDelete();
        if (id !== null) {
            this.tasksService.deleteTask(id);
        }
        this.cancelDelete();
    }

    resetFilters(): void {
        this.searchTerm.set('');
        this.priorityFilter.set('');
        this.onlyOverdue.set(false);
    }

    // ---------------------------------------------------------------- modèle

    private toCard(task: Task): TaskCard {
        const links: LinkedApplication[] = (task.applicationIds ?? [])
            .map(id => {
                const application = this.store.application(id);
                if (!application) return null;
                const company = this.store.company(application.companyId);
                return {
                    id,
                    label: `${application.title} — ${company?.name ?? NO_COMPANY_LABEL}`
                };
            })
            .filter((entry): entry is LinkedApplication => entry !== null);

        const due = new Date(task.dueDate);
        const today = startOfDay(new Date());
        const dueDay = startOfDay(due);
        const days = Math.round((dueDay.getTime() - today.getTime()) / 86400000);

        return {
            task,
            links,
            orphans: task.relatedOffers ?? [],
            dueLabel: dueLabel(days, due),
            overdue: !task.completed && days < 0,
            dueToday: !task.completed && days === 0
        };
    }
}

// --------------------------------------------------------------------------

function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dueLabel(days: number, date: Date): string {
    if (days === 0) return "aujourd'hui";
    if (days === 1) return 'demain';
    if (days === -1) return 'hier';
    if (days < 0) return `il y a ${Math.abs(days)} jours`;
    if (days <= 7) return `dans ${days} jours`;
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
