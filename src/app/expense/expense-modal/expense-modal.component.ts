import { Component } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { filter, finalize, from } from 'rxjs';
import { CategoryModalComponent } from '../../category/category-modal/category-modal.component';
import { ActionSheetService } from '../../shared/service/action-sheet.service';
import { ToastService } from '../../shared/service/toast.service';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Category, CategoryCriteria, ExpenseUpsertDto } from '../../shared/domain';
import { CategoryService } from '../../category/category.service';
import { formatISO, parseISO } from 'date-fns';
import { ExpenseService } from '../expense.service';

@Component({
  selector: 'app-expense-modal',
  templateUrl: './expense-modal.component.html',
})
export class ExpenseModalComponent {
  expense: ExpenseUpsertDto = {} as ExpenseUpsertDto;
  readonly expenseForm: FormGroup;
  showCategoryForm = false;
  submitting = false;
  date: string;
  categories: Category[] = [];
  readonly initialSort = 'name,asc';
  lastPageReached = false;
  loading = false;
  searchCriteria: CategoryCriteria = { page: 0, size: 25, sort: this.initialSort };

  constructor(
    private readonly actionSheetService: ActionSheetService,
    private readonly modalCtrl: ModalController,
    private readonly expenseService: ExpenseService,
    private readonly formBuilder: FormBuilder,
    private readonly toastService: ToastService,
    private readonly categoryService: CategoryService,
  ) {
    this.expenseForm = this.formBuilder.group({
      id: [],
      name: ['', [Validators.required, Validators.maxLength(40)]],
      amount: ['', Validators.required],
      categoryId: [''],
      date: [formatISO(new Date(), { representation: 'date' })],
    });

    this.loadAllCategories();
    this.date = new Date().toISOString();
  }

  cancel(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  save(): void {
    this.submitting = true;
    console.log('Submitting expense data:', {
      ...this.expenseForm.value,
      date: formatISO(parseISO(this.expenseForm.value.date), { representation: 'date' }),
    });
    this.expenseService
      .upsertExpense({
        ...this.expenseForm.value,
        date: formatISO(parseISO(this.expenseForm.value.date), { representation: 'date' }),
      })
      .pipe(finalize(() => (this.submitting = false)))
      .subscribe({
        next: () => {
          this.toastService.displaySuccessToast('Expense saved');
          this.modalCtrl.dismiss(null, 'refresh');
        },
        error: (error: any) => {
          console.error('Could not save Expense:', error);
          this.toastService.displayErrorToast('Could not save Expense', error.message);
        },
      });
  }

  delete(): void {
    from(this.actionSheetService.showDeletionConfirmation('Are you sure you want to delete this expense?'))
      .pipe(filter((action) => action === 'delete'))
      .subscribe(() => this.modalCtrl.dismiss(null, 'delete'));
  }

  async showCategoryModal(): Promise<void> {
    const categoryModal = await this.modalCtrl.create({ component: CategoryModalComponent });
    categoryModal.present();
    const { role } = await categoryModal.onWillDismiss();
    console.log('role', role);
  }

  private loadAllCategories(): void {
    this.categoryService.getAllCategories({ sort: 'name,asc' }).subscribe({
      next: (categories) => (this.categories = categories),
      error: (error) => this.toastService.displayErrorToast('Could not load categories', error),
    });
  }

  ionViewWillEnter(): void {
    this.loadAllCategories();
  }
}
