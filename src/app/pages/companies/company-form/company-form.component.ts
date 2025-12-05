import { Component, Input, Output, EventEmitter, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
    selector: 'app-company-form',
    standalone: true,
    imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule],
    templateUrl: './company-form.component.html',
    styleUrl: './company-form.component.css'
})
export class CompanyFormComponent implements OnInit {
    @Input() companyName: string = '';
    @Input() initialData: any = {};
    @Output() save = new EventEmitter<any>();
    @Output() cancel = new EventEmitter<void>();

    formData: any = {
        description: '',
        employees: null,
        founded: null,
        group: '',
        contacts: []
    };

    ngOnInit() {
        if (this.initialData) {
            this.formData = {
                description: this.initialData.description || '', // Mapping from companyDescription if needed, but service handles standardizing
                employees: this.initialData.employees,
                founded: this.initialData.founded,
                group: this.initialData.group || '',
                contacts: this.initialData.contacts ? [...this.initialData.contacts] : []
            };
        }
    }

    addContact() {
        this.formData.contacts.push({ name: '', role: '', email: '', phone: '' });
    }

    removeContact(index: number) {
        this.formData.contacts.splice(index, 1);
    }

    onSubmit() {
        this.save.emit(this.formData);
    }
}
