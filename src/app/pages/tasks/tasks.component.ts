import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface Task {
    id: number;
    title: string;
    dueDate: Date;
    completed: boolean; // Keep for backward compatibility or sync with status
    status: 'todo' | 'in_progress' | 'done';
    relatedOffer?: string;
    priority: 'High' | 'Medium' | 'Low';
}

@Component({
    selector: 'app-tasks',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './tasks.component.html',
    styleUrl: './tasks.component.css'
})
export class TasksComponent {
    viewMode = signal<'list' | 'kanban'>('list');

    tasks = signal<Task[]>([
        {
            id: 1,
            title: 'Relancer Tech Solutions Inc.',
            dueDate: new Date('2023-11-30'),
            completed: false,
            status: 'todo',
            relatedOffer: 'Senior Angular Developer',
            priority: 'High'
        },
        {
            id: 2,
            title: 'Mettre à jour le CV',
            dueDate: new Date('2023-12-01'),
            completed: false,
            status: 'in_progress',
            priority: 'Medium'
        },
        {
            id: 3,
            title: 'Rechercher des infos sur Creative Agency',
            dueDate: new Date('2023-11-28'),
            completed: true,
            status: 'done',
            relatedOffer: 'Frontend Engineer',
            priority: 'Low'
        }
    ]);

    // Computed columns for Kanban
    todoTasks = computed(() => this.tasks().filter(t => t.status === 'todo'));
    inProgressTasks = computed(() => this.tasks().filter(t => t.status === 'in_progress'));
    doneTasks = computed(() => this.tasks().filter(t => t.status === 'done'));

    // Add Modal State
    showAddModal = signal(false);
    newTask: Partial<Task> = {
        priority: 'Medium',
        dueDate: new Date(),
        status: 'todo'
    };

    setViewMode(mode: 'list' | 'kanban') {
        this.viewMode.set(mode);
    }

    toggleTask(id: number) {
        this.tasks.update(tasks =>
            tasks.map(t => {
                if (t.id === id) {
                    const newCompleted = !t.completed;
                    return {
                        ...t,
                        completed: newCompleted,
                        status: newCompleted ? 'done' : 'todo'
                    };
                }
                return t;
            })
        );
    }

    updateTaskStatus(id: number, newStatus: 'todo' | 'in_progress' | 'done') {
        this.tasks.update(tasks =>
            tasks.map(t => t.id === id ? { ...t, status: newStatus, completed: newStatus === 'done' } : t)
        );
    }

    deleteTask(id: number) {
        this.tasks.update(tasks => tasks.filter(t => t.id !== id));
    }

    openAddModal() {
        this.newTask = { priority: 'Medium', dueDate: new Date(), status: 'todo' };
        this.showAddModal.set(true);
    }

    closeAddModal() {
        this.showAddModal.set(false);
    }

    addTask() {
        if (this.newTask.title) {
            const task: Task = {
                id: Date.now(),
                title: this.newTask.title,
                dueDate: this.newTask.dueDate ? new Date(this.newTask.dueDate) : new Date(),
                completed: false,
                status: 'todo',
                priority: this.newTask.priority || 'Medium',
                relatedOffer: this.newTask.relatedOffer
            };
            this.tasks.update(tasks => [task, ...tasks]);
            this.closeAddModal();
        }
    }
}
