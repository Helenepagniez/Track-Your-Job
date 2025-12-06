import { Component, EventEmitter, Input, Output, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatStepperModule } from '@angular/material/stepper';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { JobOffer, OffersService } from '../../core/services/offers.service';

@Component({
    selector: 'app-offer-form',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatStepperModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        MatSelectModule,
        MatOptionModule,
        MatAutocompleteModule
    ],
    templateUrl: './offer-form.component.html',
    styleUrl: './offer-form.component.css'
})
export class OfferFormComponent implements OnInit {
    private _formBuilder = inject(FormBuilder);
    private _offersService = inject(OffersService);

    @Input() offer: JobOffer | null = null;
    @Output() save = new EventEmitter<Partial<JobOffer>>();
    @Output() cancel = new EventEmitter<void>();

    isEditing = signal(false);
    filteredCompanies = signal<string[]>([]);

    firstFormGroup: FormGroup = this._formBuilder.group({
        title: ['', Validators.required],
        company: ['', Validators.required],
        contractType: [''],
        location: [''],
        salary: [''],
        link: ['']
    });

    secondFormGroup: FormGroup = this._formBuilder.group({
        companyDescription: [''],
        missions: [''],
        profile: ['']
    });

    thirdFormGroup: FormGroup = this._formBuilder.group({
        benefits: [''],
        recruitmentProcess: [''],
        others: [''],
        status: ['To Apply', Validators.required]
    });

    ngOnInit() {
        this.firstFormGroup.get('company')?.valueChanges.subscribe(value => {
            this._filterCompanies(value || '');
        });

        if (this.offer) {
            this.isEditing.set(true);
            this.firstFormGroup.patchValue({
                title: this.offer.title,
                company: this.offer.company,
                contractType: this.offer.contractType,
                location: this.offer.location,
                salary: this.offer.salary,
                link: this.offer.link
            });
            this.secondFormGroup.patchValue({
                companyDescription: this.offer.companyDescription,
                missions: this.offer.missions,
                profile: this.offer.profile
            });
            this.thirdFormGroup.patchValue({
                benefits: this.offer.benefits,
                recruitmentProcess: this.offer.recruitmentProcess,
                others: this.offer.others,
                status: this.offer.status
            });
        }
    }

    submit() {
        if (this.firstFormGroup.valid && this.thirdFormGroup.valid) {
            const step1 = this.firstFormGroup.value;
            const step2 = this.secondFormGroup.value;
            const step3 = this.thirdFormGroup.value;

            const offerData: Partial<JobOffer> = {
                title: step1.title,
                company: step1.company,
                contractType: step1.contractType,
                location: step1.location || 'Remote',
                salary: step1.salary,
                link: step1.link,

                companyDescription: step2.companyDescription,
                missions: step2.missions,
                profile: step2.profile,

                benefits: step3.benefits,
                recruitmentProcess: step3.recruitmentProcess,
                others: step3.others,
                status: step3.status || 'To Apply',
                description: step2.missions // Fallback
            };

            this.save.emit(offerData);
        }
    }

    private _filterCompanies(value: string) {
        const filterValue = value.toLowerCase();

        // Get unique companies from offers
        const uniqueCompanies = Array.from(new Set(this._offersService.offers().map(o => o.company))).sort();

        if (!filterValue) {
            this.filteredCompanies.set([]);
            return;
        }

        const filtered = uniqueCompanies.filter(company => {
            const words = company.toLowerCase().split(' ');
            // Check if query matches start of any word
            return words.some(word => word.startsWith(filterValue));
        });

        this.filteredCompanies.set(filtered);
    }
}
