import { assertIsDefined } from 'do/base/common/types';
import { IInstantiationService, ServicesAccessor } from 'do/platform/instantiation/common/instantiation';
import { MenuId, Action2, IAction2Options, IMenuService, SubmenuItemAction } from 'do/platform/actions/common/actions';
import { createActionViewItem } from 'do/platform/actions/browser/menuEntryActionViewItem';
import { parseLinkedText } from 'do/base/common/linkedText';
import { IOpenerService } from 'do/platform/opener/common/opener';