import { Component } from '@angular/core';
import { addMonths, set, subMonths } from 'date-fns';
import {
  InfiniteScrollCustomEvent,
  ModalController,
  RefresherCustomEvent,
  ViewDidLeave,
  ViewWillEnter,
} from '@ionic/angular';
import { ExpenseModalComponent } from '../expense-modal/expense-modal.component';
import { Category, Expense, ExpenseCriteria, SortOption } from '../../shared/domain';
import { FormBuilder, FormGroup } from '@angular/forms';
import { CategoryService } from '../../category/category.service';
import { ToastService } from '../../shared/service/toast.service';
import { formatPeriod } from '../../shared/period';
import { debounce, finalize, from, groupBy, interval, mergeMap, Subscription, toArray } from 'rxjs';
import { ExpenseService } from '../expense.service';

interface ExpenseGroup {
  date: string;
  expenses: Expense[];
}
@Component({
  selector: 'app-expense-overview',
  templateUrl: './expense-list.component.html',
})
export class ExpenseListComponent implements ViewWillEnter, ViewDidLeave {
  readonly initialSort = 'categoryIds,asc';
  date = set(new Date(), { date: 1 });
  searchCriteria: ExpenseCriteria = { page: 0, size: 25, sort: this.initialSort };
  categories: Category[] | null = null;
  expenseGroups: ExpenseGroup[] | null = null;
  lastPageReached = false;
  loading = false;
  expenses: Expense[] | null = null;

  readonly searchForm: FormGroup;
  readonly sortOptions: SortOption[] = [
    { label: 'Created at (newest first)', value: 'createdAt,desc' },
    { label: 'Created at (oldest first)', value: 'createdAt,asc' },
    { label: 'Date (newest first)', value: 'categoryIds,asc' },
    { label: 'Date (oldest first)', value: 'categoryIds,desc' },
    { label: 'Name (A-Z)', value: 'name,asc' },
    { label: 'Name (Z-A)', value: 'name,desc' },
  ];
  private readonly searchFormSubscription: Subscription;

  constructor(
    private readonly modalCtrl: ModalController,
    private readonly formBuilder: FormBuilder,
    private readonly categoryService: CategoryService,
    private readonly toastService: ToastService,
    private readonly expenseService: ExpenseService,
  ) {
    this.searchForm = this.formBuilder.group({ name: [], sort: [this.initialSort] });
    this.searchFormSubscription = this.searchForm.valueChanges
      .pipe(debounce((value) => interval(value.name?.length ? 400 : 0)))
      .subscribe((value) => {
        this.searchCriteria = { ...this.searchCriteria, ...value, page: 0 };
        this.loadExpenses();
      });
  }

  addMonths = (number: number): void => {
    this.date = addMonths(this.date, number);
  };

  subtractMonths(number: number): void {
    this.date = subMonths(this.date, number);
  }

  async openModal(expense?: Expense): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: ExpenseModalComponent,
      componentProps: { expense: expense ? { ...expense } : {} },
    });
    modal.present();
    const { role } = await modal.onWillDismiss();
    console.log('role', role);
  }

  private loadAllCategories(): void {
    this.categoryService.getAllCategories({ sort: 'name,asc' }).subscribe({
      next: (categories) => (this.categories = categories),
      error: (error) => this.toastService.displayErrorToast('Could not load categories', error),
    });
  }

  private loadExpenses(next: () => void = () => {}): void {
    console.log('Loading Expenses.');
    this.searchCriteria.yearMonth = formatPeriod(this.date);
    if (!this.searchCriteria.categoryIds?.length) delete this.searchCriteria.categoryIds;
    if (!this.searchCriteria.name) delete this.searchCriteria.name;
    this.loading = true;
    const groupByDate = this.searchCriteria.sort.startsWith('categoryIds');
    this.expenseService
      .getExpenses(this.searchCriteria)
      .pipe(
        finalize(() => {
          this.loading = false;
          console.log('Expenses loaded.');
        }),
        mergeMap((expensePage) => {
          this.lastPageReached = expensePage.last;
          console.log('Received Expenses.', expensePage.content);
          next();
          if (this.searchCriteria.page === 0 || !this.expenseGroups) this.expenseGroups = [];
          return from(expensePage.content).pipe(
            groupBy((expense) => (groupByDate ? expense.date : expense.id)),
            mergeMap((group) => group.pipe(toArray())),
          );
        }),
      )
      .subscribe({
        next: (expenses: Expense[]) => {
          console.log('Received Expenses in groups.', expenses);
          const expenseGroup: ExpenseGroup = {
            date: expenses[0].date,
            expenses: this.sortExpenses(expenses),
          };
          const expenseGroupWithSameDate = this.expenseGroups!.find((other) => other.date === expenseGroup.date);
          if (!expenseGroupWithSameDate || !groupByDate) this.expenseGroups!.push(expenseGroup);
          else
            expenseGroupWithSameDate.expenses = this.sortExpenses([
              ...expenseGroupWithSameDate.expenses,
              ...expenseGroup.expenses,
            ]);
        },
        error: (error) => this.toastService.displayErrorToast('Could not load expenses', error),
      });
  }

  private sortExpenses = (expenses: Expense[]): Expense[] => expenses.sort((a, b) => a.name.localeCompare(b.name));

  ionViewWillEnter(): void {
    this.loadAllCategories();
  }

  loadNextExpensePage($event: any) {
    this.searchCriteria.page++;
    this.loadExpenses(() => ($event as InfiniteScrollCustomEvent).target.complete());
  }

  reloadExpenses($event?: any): void {
    this.searchCriteria.page = 0;
    this.loadExpenses(() => ($event ? ($event as RefresherCustomEvent).target.complete() : {}));
  }
  ionViewDidLeave(): void {
    this.searchFormSubscription.unsubscribe();
  }
}
