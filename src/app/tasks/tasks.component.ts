import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { TaskFormComponent } from './task-form/task-form.component';
import { Task } from './task.model';
import { TasksService } from '../core/services/tasks.service';

@Component({
    selector: 'app-tasks',
    standalone: true,
    imports: [CommonModule, FormsModule, DragDropModule, TaskFormComponent],
    templateUrl: './tasks.component.html',
    styleUrl: './tasks.component.css'
})
export class TasksComponent {
    private tasksService = inject(TasksService);

    viewMode = signal<'list' | 'kanban'>('kanban');

    tasks = this.tasksService.tasks;

    // Computed columns for Kanban
    todoTasks = computed(() => this.tasks().filter(t => t.status === 'a_faire'));
    inProgressTasks = computed(() => this.tasks().filter(t => t.status === 'en_cours'));
    doneTasks = computed(() => this.tasks().filter(t => t.status === 'termine'));

    // Add Modal State
    showAddModal = signal(false);
    selectedTask = signal<Task | null>(null);

    // Delete Confirmation State
    showDeleteConfirm = signal(false);
    taskToDelete = signal<number | null>(null);

    dropList(event: CdkDragDrop<Task[]>) {
        const currentTasks = [...this.tasks()];
        moveItemInArray(currentTasks, event.previousIndex, event.currentIndex);
        this.tasksService.setTasks(currentTasks);
    }

    drop(event: CdkDragDrop<Task[]>) {
        if (event.previousContainer === event.container) {
            // Reordering within the same list
            const list = [...event.container.data];
            moveItemInArray(list, event.previousIndex, event.currentIndex);

            const todo = event.container.id === 'todoList' ? list : [...this.todoTasks()];
            const inProgress = event.container.id === 'inProgressList' ? list : [...this.inProgressTasks()];
            const done = event.container.id === 'doneList' ? list : [...this.doneTasks()];

            this.tasksService.setTasks([...todo, ...inProgress, ...done]);
        } else {
            // Moving between lists
            const previousList = [...event.previousContainer.data];
            const currentList = [...event.container.data];

            transferArrayItem(
                previousList,
                currentList,
                event.previousIndex,
                event.currentIndex
            );

            // Update status of the moved item
            const movedTask = currentList[event.currentIndex];
            let newStatus: 'a_faire' | 'en_cours' | 'termine' = 'a_faire';

            if (event.container.id === 'todoList') newStatus = 'a_faire';
            else if (event.container.id === 'inProgressList') newStatus = 'en_cours';
            else if (event.container.id === 'doneList') newStatus = 'termine';

            movedTask.status = newStatus;
            movedTask.completed = newStatus === 'termine';

            let todo = [...this.todoTasks()];
            let inProgress = [...this.inProgressTasks()];
            let done = [...this.doneTasks()];

            if (event.previousContainer.id === 'todoList') todo = previousList;
            else if (event.previousContainer.id === 'inProgressList') inProgress = previousList;
            else if (event.previousContainer.id === 'doneList') done = previousList;

            if (event.container.id === 'todoList') todo = currentList;
            else if (event.container.id === 'inProgressList') inProgress = currentList;
            else if (event.container.id === 'doneList') done = currentList;

            this.tasksService.setTasks([...todo, ...inProgress, ...done]);
        }
    }

    setViewMode(mode: 'list' | 'kanban') {
        this.viewMode.set(mode);
    }

    toggleTask(id: number) {
        this.tasksService.toggleTask(id);
    }

    updateTaskStatus(id: number, newStatus: 'a_faire' | 'en_cours' | 'termine') {
        this.tasksService.updateTaskStatus(id, newStatus);
    }

    confirmDelete(id: number) {
        this.taskToDelete.set(id);
        this.showDeleteConfirm.set(true);
    }

    cancelDelete() {
        this.showDeleteConfirm.set(false);
        this.taskToDelete.set(null);
    }

    deleteTask() {
        if (this.taskToDelete()) {
            this.tasksService.deleteTask(this.taskToDelete()!);
            this.showDeleteConfirm.set(false);
            this.taskToDelete.set(null);
        }
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
            const updatedTask: Task = { ...this.selectedTask()!, ...processedData } as Task;
            this.tasksService.updateTask(updatedTask);
        } else {
            // Add new
            const newTask: Task = {
                id: Date.now(),
                title: processedData.title!,
                dueDate: processedData.dueDate || new Date(),
                completed: false,
                status: 'a_faire',
                priority: processedData.priority || 'moyenne',
                relatedOffers: processedData.relatedOffers
            };
            this.tasksService.addTask(newTask);
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

    getDaysLeft(dueDate: Date): number {
        const today = new Date();
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const startOfDue = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

        const diffMs = startOfDue.getTime() - startOfToday.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        return diffDays;
    }
}
