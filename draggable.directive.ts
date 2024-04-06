import {
  Directive,
  ElementRef,
  EmbeddedViewRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  Renderer2,
  TemplateRef,
  ViewContainerRef,
} from '@angular/core';

export type ListDragReordering = { oldIndex: number; newIndex: number };

@Directive({
  selector: '[appDraggable]',
  standalone: true,
})
export class appDraggableDirective implements OnDestroy {
  private isDragging: boolean = false;
  private initialX: number = 0;
  private initialY: number = 0;
  private initialWidth!: CSSStyleDeclaration;
  private prevX: number = 0;
  private prevY: number = 0;
  private rowPlaceholderViewRef: EmbeddedViewRef<HTMLElement> | null = null;
  private rowPlaceholderElement!: HTMLElement | null;
  private oldIndex: number = -1;
  private mouseMoveListener!:
    | undefined
    | OmitThisParameter<(event: MouseEvent) => void>;

  @Input() blockedAxis!: 'x' | 'y' | undefined;
  @Input() zIndex!: number;
  @Input() dragBy!: string;
  @Input() rowPlaceholder!: TemplateRef<HTMLElement>;
  @Output() changeCurrentElIndex: EventEmitter<{
    oldIndex: number;
    newIndex: number;
  }> = new EventEmitter<ListDragReordering>();

  constructor(
    private elementRef: ElementRef,
    private renderer: Renderer2,
    private viewContainerRef: ViewContainerRef
  ) {
    this.initialX = this.elementRef.nativeElement.offsetLeft;
    this.initialY = this.elementRef.nativeElement.offsetTop;
    this.initialWidth = window.getComputedStyle(this.elementRef.nativeElement);
    this.mouseMoveListener = this.onMouseMove.bind(this); // Bound method for proper removal
  }

  ngOnDestroy(): void {
    this.cleanupListeners();
  }

  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent) {
    let dragHandler: HTMLElement | null = null;

    if (this.dragBy) {
      dragHandler = this.elementRef.nativeElement.querySelector(
        `.${this.dragBy}`
      );
    }

    // Check if the mousedown event occurred on the drag handle, or on the element itself if no handle is specified
    if (
      !this.dragBy ||
      (dragHandler && dragHandler.contains(event.target as Node))
    ) {
      // Reset styles and position before starting new drag
      this.renderer.removeAttribute(this.elementRef.nativeElement, 'style');
      this.renderer.removeClass(
        this.elementRef.nativeElement,
        'app-draggable-dragging'
      );

      this.isDragging = true;
      this.initialX = event.clientX + window.scrollX;
      this.initialY = event.clientY + window.scrollY;
      this.prevX = this.initialX;
      this.prevY = this.initialY;

      this.renderer.setStyle(
        this.elementRef.nativeElement,
        'width',
        this.initialWidth
      );
      this.renderer.setStyle(
        this.elementRef.nativeElement,
        'position',
        'fixed'
      );
      this.renderer.setStyle(this.elementRef.nativeElement, 'z-index', '11');
      this.renderer.setStyle(
        this.elementRef.nativeElement,
        'cursor',
        'grabbing'
      );
      this.renderer.setStyle(
        this.elementRef.nativeElement,
        'transition',
        'top left .15s ease-in'
      );
      this.renderer.setStyle(
        this.elementRef.nativeElement,
        'user-select',
        'none'
      );
      this.renderer.addClass(
        this.elementRef.nativeElement,
        'app-draggable-dragging'
      );

      // Create placeholder element
      if (this.rowPlaceholder) {
        this.createRowPlaceholderElement(this.rowPlaceholder);
      }
    }
  }

  @HostListener('document:mouseup')
  onMouseUp() {
    if (this.isDragging) {
      this.isDragging = false;
      this.cleanupListeners();

      // Remove all styles from the draggable element
      this.renderer.removeAttribute(this.elementRef.nativeElement, 'style');
      this.renderer.removeClass(
        this.elementRef.nativeElement,
        'app-draggable-dragging'
      );

      // Set initial values
      this.initialX = this.elementRef.nativeElement.offsetLeft;
      this.initialY = this.elementRef.nativeElement.offsetTop;

      // Remove placeholder elements
      this.removeRowPlaceholderElement();
      this.removeRowPlaceholderElement();

      // Emit the old and new indexes
      this.changeCurrentElIndex.emit({
        oldIndex: this.oldIndex,
        newIndex: this.elementRef.nativeElement.oldIndex,
      });
    }
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (this.isDragging) {
      const offsetX = event.clientX - this.prevX;
      const offsetY = event.clientY - this.prevY;
      const newLeft = this.elementRef.nativeElement.offsetLeft + offsetX;
      const newTop = this.elementRef.nativeElement.offsetTop + offsetY;

      // dragging horizontally
      if (this.blockedAxis !== 'x') {
        this.renderer.setStyle(
          this.elementRef.nativeElement,
          'left',
          newLeft + 'px'
        );
      }

      // dragging vertically, ex: the element in the list
      if (this.blockedAxis !== 'y') {
        this.renderer.setStyle(
          this.elementRef.nativeElement,
          'top',
          newTop + 'px'
        );

        // Get an element under the cursor
        const elementUnderCursor = document.elementFromPoint(
          event.clientX,
          event.clientY
        );

        if (elementUnderCursor instanceof HTMLElement) {
          // Check if the element is a child of the parent list
          const parentElement = this.elementRef.nativeElement.parentElement;

          // Filter out placeholder elements
          const items = Array.from(parentElement.children).filter(
            child => child !== this.rowPlaceholderElement
          );

          const itemsNumber = items.length;

          // Calculate the index of the target element
          let newIndex = items.indexOf(elementUnderCursor) + 1;
          newIndex = newIndex < 0 ? 0 : newIndex;

          // If newIndex is greater than oldIndex (dragging down in the list),
          // decrease or increase newIndex by 1 to accurately reflect the position
          if (newIndex > this.oldIndex) {
            newIndex--;
            newIndex = newIndex < 0 ? 0 : newIndex;
          }

          if (newIndex < this.oldIndex) {
            newIndex++;
            newIndex = newIndex > itemsNumber ? itemsNumber - 1 : newIndex;
          }

          // If newIndex is equal to oldIndex, check if the mouse movement indicates a return
          // to the original position
          if (newIndex === this.oldIndex && event.clientY < this.prevY) {
            newIndex--; // Adjust newIndex to reflect the return to the original position
          }

          // Create placeholder
          if (this.rowPlaceholder) {
            this.changeRowPlaceholderIndex(this.rowPlaceholder, newIndex);
          }

          this.oldIndex = newIndex; // Update old index
        }
      }

      this.prevX = event.clientX;
      this.prevY = event.clientY;
    }
  }

  private createRowPlaceholderElement(tpl: TemplateRef<HTMLElement>): void {
    // Remove any existing placeholder
    this.removeRowPlaceholderElement();

    // Create the placeholder using TemplateRef and ViewContainerRef
    this.rowPlaceholderViewRef = this.viewContainerRef.createEmbeddedView(tpl);

    // Get the root element of the created view
    this.rowPlaceholderElement = this.rowPlaceholderViewRef
      .rootNodes[0] as HTMLElement;

    // Insert the placeholder after the current element
    this.renderer.insertBefore(
      this.elementRef.nativeElement.parentNode,
      this.rowPlaceholderElement,
      this.elementRef.nativeElement.nextSibling
    );
  }

  private changeRowPlaceholderIndex(
    tpl: TemplateRef<HTMLElement>,
    index: number
  ): void {
    this.removeRowPlaceholderElement();
    this.rowPlaceholderViewRef = this.viewContainerRef.createEmbeddedView(tpl);
    this.rowPlaceholderElement = this.rowPlaceholderViewRef
      .rootNodes[0] as HTMLElement;

    // Check if rowPlaceholderElement is not null before inserting
    if (this.rowPlaceholderElement) {
      const parentElement = this.elementRef.nativeElement.parentNode;
      const children = parentElement.children;
      const childCount = children.length;

      // If dragging below the list (index is the last child), insert after the last child
      if (index === childCount) {
        this.renderer.appendChild(parentElement, this.rowPlaceholderElement);
      }
      // Otherwise, insert before the element at the calculated index
      else {
        this.renderer.insertBefore(
          parentElement,
          this.rowPlaceholderElement,
          children[index]
        );
      }
    }
  }

  private removeRowPlaceholderElement(): void {
    if (this.rowPlaceholderViewRef) {
      this.rowPlaceholderViewRef.destroy(); // Clean up the view ref
      this.rowPlaceholderViewRef = null;
    }
    if (this.rowPlaceholderElement && this.rowPlaceholderElement.parentNode) {
      this.rowPlaceholderElement.parentNode.removeChild(
        this.rowPlaceholderElement
      );
      this.rowPlaceholderElement = null;
    }
  }

  private cleanupListeners(): void {
    if (this.mouseMoveListener) {
      document.removeEventListener('mousemove', this.mouseMoveListener);
      this.mouseMoveListener = undefined;
    }
  }
}
