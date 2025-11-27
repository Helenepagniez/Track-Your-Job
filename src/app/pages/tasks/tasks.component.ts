import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Task {
    id: number;
    title: string;
    dueDate: Date;
    completed: boolean;
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
    tasks = signal<Task[]>([
        {
            id: 1,
            title: 'Relancer Tech Solutions Inc.',
            dueDate: new Date('2023-11-30'),
            completed: false,
            relatedOffer: 'Senior Angular Developer',
            priority: 'High'
        },
        {
            id: 2,
            title: 'Mettre à jour le CV',
            dueDate: new Date('2023-12-01'),
            completed: false,
            priority: 'Medium'
        },
        {
            id: 3,
            title: 'Rechercher des infos sur Creative Agency',
            dueDate: new Date('2023-11-28'),
            completed: true,
            relatedOffer: 'Frontend Engineer',
            priority: 'Low'
        }
    ]);

    // Add Modal State
    showAddModal = signal(false);
    newTask: Partial<Task> = {
        priority: 'Medium',
        dueDate: new Date()
    };

    toggleTask(id: number) {
        this.tasks.update(tasks =>
            tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t)
        );
    }

    deleteTask(id: number) {
        this.tasks.update(tasks => tasks.filter(t => t.id !== id));
    }

    openAddModal() {
        this.newTask = { priority: 'Medium', dueDate: new Date() };
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
                priority: this.newTask.priority || 'Medium',
                relatedOffer: this.newTask.relatedOffer
            };
            this.tasks.update(tasks => [task, ...tasks]);
            this.closeAddModal();
        }
    }
}
