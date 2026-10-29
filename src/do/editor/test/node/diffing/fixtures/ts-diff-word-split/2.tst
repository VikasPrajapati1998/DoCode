import { findLast } from 'do/base/common/arrays';
import { Disposable } from 'do/base/common/lifecycle';
import { ITransaction, observableFromEvent, observableValue, transaction } from 'do/base/common/observable';
import { Range } from 'do/editor/common/core/range';
import { ScrollType } from 'do/editor/common/editorCommon';
import { IFooBar, IBar, IFoo } from 'foo';

console.log(observableFromEvent, observableValue);

console.log(observableValue, observableFromEvent);
