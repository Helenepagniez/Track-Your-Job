import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TaskFormComponent } from './task-form/task-form.component';
import { Task } from './task.model';

@Component({
    selector: 'app-tasks',
    standalone: true,
    imports: [CommonModule, FormsModule, TaskFormComponent],
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
            status: 'a_faire',
            relatedOffer: 'Senior Angular Developer',
            priority: 'haute'
        },
        {
            id: 2,
            title: 'Mettre à jour le CV',
            dueDate: new Date('2023-12-01'),
            completed: false,
            status: 'en_cours',
            priority: 'moyenne'
        },
        {
            id: 3,
            title: 'Rechercher des infos sur Creative Agency',
            dueDate: new Date('2023-11-28'),
            completed: true,
            status: 'termine',
            relatedOffer: 'Frontend Engineer',
            priority: 'faible'
        }
    ]);

    // Computed columns for Kanban
    todoTasks = computed(() => this.tasks().filter(t => t.status === 'a_faire'));
    inProgressTasks = computed(() => this.tasks().filter(t => t.status === 'en_cours'));
    doneTasks = computed(() => this.tasks().filter(t => t.status === 'termine'));

    // Add Modal State
    showAddModal = signal(false);
    selectedTask = signal<Task | null>(null);

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
                        status: newCompleted ? 'termine' : 'a_faire'
                    };
                }
                return t;
            })
        );
    }

    updateTaskStatus(id: number, newStatus: 'a_faire' | 'en_cours' | 'termine') {
        this.tasks.update(tasks =>
            tasks.map(t => t.id === id ? { ...t, status: newStatus, completed: newStatus === 'termine' } : t)
        );
    }

    deleteTask(id: number) {
        this.tasks.update(tasks => tasks.filter(t => t.id !== id));
    }

    openAddModal() {
        this.selectedTask.set(null);
        this.showAddModal.set(true);
    }

    closeAddModal() {
        this.showAddModal.set(false);
        this.selectedTask.set(null);
    }

    handleSaveTask(taskData: Partial<Task>) {
        const processedData = { ...taskData };
        if (processedData.dueDate) {
            processedData.dueDate = new Date(processedData.dueDate);
        }

        if (this.selectedTask()) {
            // Update existing
            this.tasks.update(tasks => tasks.map(t => t.id === this.selectedTask()!.id ? { ...t, ...processedData } as Task : t));
        } else {
            // Add new
            const newTask: Task = {
                id: Date.now(),
                title: processedData.title!,
                dueDate: processedData.dueDate || new Date(),
                completed: false,
                status: 'a_faire',
                priority: processedData.priority || 'moyenne',
                relatedOffer: processedData.relatedOffer
            };
            this.tasks.update(tasks => [newTask, ...tasks]);
        }
        this.closeAddModal();
    }

    updateTask(id: number) {
        const task = this.tasks().find(t => t.id === id);
        if (task) {
            this.selectedTask.set(task);
            this.showAddModal.set(true);
        }
    }
}
