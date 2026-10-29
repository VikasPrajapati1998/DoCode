# @vscode/observables

A lightweight, fine-grained reactive programming library for building observable state management. Originally developed for Visual Studio Code.

## Installation

```bash
npm install @vscode/observables
```

## Core Concepts

### Observable Values

Create mutable observable values:

```typescript
import { observableValue } from '@vscode/observables';

const count = observableValue(/* for debugging */ 'count', 0);

// Read the current value
console.log(count.get()); // 0

// Set a new value
count.set(5, undefined);

```

In classes you an use `this` as owner:

```ts
class Model {
    public readonly count = observableValue(this, 0);
}
```

### Derived Observables

Create computed values that automatically update when dependencies change:

```typescript
import { observableValue, derived } from '@vscode/observables';

class Model {
    public readonly count = observableValue(this, 'count', 5);
    public readonly doubled = derived(this, reader => this.count.read(reader) * 2);
    public readonly tripled = derived(this, reader => this.count.read(reader) * 3);
}


console.log(doubled.get()); // 10
console.log(tripled.get()); // 15

count.set(10, undefined);
console.log(doubled.get()); // 20
```

### Effects

React to changes automatically:

```typescript
import { observableValue, createEffect } from '@vscode/observables';

const count = observableValue('count', 0);

const disposable = createEffect(reader => {
  console.log('Count:', count.read(reader));
});

count.set(5, undefined); // Logs: Count: 5
count.set(10, undefined); // Logs: Count: 10

// Cleanup when done
disposable.dispose();
```

### Transactions

Batch multiple changes to avoid intermediate updates:

```typescript
import { observableValue, transaction, createEffect } from '@vscode/observables';

const firstName = observableValue('firstName', 'John');
const lastName = observableValue('lastName', 'Doe');

createEffect(reader => {
  console.log(`${firstName.read(reader)} ${lastName.read(reader)}`);
});
// Logs: John Doe

// Both changes are applied atomically - only one effect execution
transaction(tx => {
  firstName.set('Jane', tx);
  lastName.set('Smith', tx);
});
// Logs: Jane Smith (only once)
```

## API Reference

### Observables

- `observableValue(owner, initialValue)` - Create a settable observable value
- `derived(owner, computeFn)` - Create a computed observable
- `derivedWithStore(owner, computeFn)` - Derived with disposable store
- `derivedDisposable(computeFn)` - Derived that disposes previous values
- `constObservable(value)` - Create a constant (never-changing) observable
- `observableSignal(owner)` - Create a signal for triggering updates
- `observableFromEvent(event, getValue)` - Create observable from an event

### Reactions

- `createEffect(fn)` - Run a function whenever observed values change
- `createEffectOpts(options, fn)` - Create an effect with debug metadata
- `autorun(fn)` - Deprecated alias for `createEffect`
- `autorunOpts(options, fn)` - Deprecated alias for `createEffectOpts`
- `autorunWithStore(fn)` - Autorun with a disposable store
- `autorunHandleChanges(fn, handleChange)` - Autorun with change handling
- `runOnChange(observable, callback)` - React to specific observable changes

### Transactions

- `transaction(fn)` - Batch multiple updates atomically
- `globalTransaction(fn)` - Global transaction scope
- `subtransaction(fn, tx)` - Create a nested transaction

### Utilities

- `waitForState(observable, predicate)` - Await until predicate is true
- `keepObserved(observable)` - Keep an observable observed (prevents GC)
- `debouncedObservable(observable, delay)` - Debounce observable updates
- `mapObservableArrayCached(array, mapFn)` - Efficiently map observable arrays

### Collections

- `ObservableSet<T>` - Observable Set collection
- `ObservableMap<K, V>` - Observable Map collection

### Disposables

- `IDisposable` - Interface for disposable resources
- `DisposableStore` - Container for managing multiple disposables
- `Disposable` - Base class with built-in store

## Owner Pattern

The first argument to `observableValue` and `derived` is an "owner" object used for debugging. It should implement `toString()` or be `this` in a class:

```typescript
class Counter {
  private readonly count = observableValue(this, 0);
  
  toString() {
    return 'Counter';
  }
}
```

## License

MIT
