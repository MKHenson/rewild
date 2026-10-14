import {
  Button,
  Component,
  Date as DateView,
  Icon,
  InfoBox,
  register,
  Table,
  TableColumn,
  TablePagination,
  TableSort,
  theme,
} from 'rewild-ui';
import {
  AdminProject,
  AdminProjectPage,
  AdminProjectSort,
  flagProject,
  getAdminProjects,
  unflagProject,
} from '../../../api/admin';
import { confirmationStore } from '../../stores/ConfirmationStore';
import { ProjectImage } from '../common/ProjectImage';

export const PROJECTS_PATH = '/admin/projects';

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

type Props = {
  /** Plays the project. */
  onRun: (projectId: string) => void;
};

type Notice = { variant: 'info' | 'error'; title: string; text: string };

/** The `/admin/projects` tab: every user's projects, with Run and a confirm-gated Flag / Unflag. */
@register('x-admin-project-list')
export class ProjectList extends Component<Props> {
  init() {
    const [data, setData] = this.useState<AdminProjectPage | null>(null);
    const [loading, setLoading] = this.useState(true);
    const [page, setPage] = this.useState(0);
    const [rowsPerPage, setRowsPerPage] = this.useState(25);
    // Null leaves the server's order: newest first.
    const [sort, setSort] = this.useState<TableSort | null>(null);
    const [notice, setNotice] = this.useState<Notice | null>(null);

    const load = async () => {
      setLoading(true);
      try {
        const active = sort();
        const order = active
          ? { sort: active.key as AdminProjectSort, order: active.direction }
          : {};
        setData(
          await getAdminProjects({
            ...order,
            page: page(),
            pageSize: rowsPerPage(),
          }),
          false
        );
      } catch (err: any) {
        setNotice(
          {
            variant: 'error',
            title: 'Could not load projects',
            text: err.message,
          },
          false
        );
      }
      setLoading(false);
    };

    const toggleFlag = (project: AdminProject) => {
      const flagging = !project.flaggedAt;
      const name = project.name || 'Untitled Project';
      confirmationStore.show(
        flagging ? 'Flag Project' : 'Unflag Project',
        flagging
          ? `Flag "${name}"? Players can no longer start it. Its owner and admins still can.`
          : `Unflag "${name}"? Players with access can start it again.`,
        async () => {
          try {
            await (flagging
              ? flagProject(project.id)
              : unflagProject(project.id));
            setNotice(
              {
                variant: 'info',
                title: flagging ? 'Flagged' : 'Unflagged',
                text: `"${name}" was ${flagging ? 'flagged' : 'unflagged'}.`,
              },
              false
            );
          } catch (err: any) {
            setNotice(
              {
                variant: 'error',
                title: flagging ? 'Flag failed' : 'Unflag failed',
                text: err.message,
              },
              false
            );
          }
          load();
        },
        flagging ? { okLabel: 'Flag', okColor: 'error' } : { okLabel: 'Unflag' }
      );
    };

    const flagButton = (project: AdminProject) => {
      const label = project.flaggedAt ? 'Unflag project' : 'Flag project';
      const button = (
        <Button
          variant="text"
          size="s"
          color={project.flaggedAt ? undefined : 'error'}
          onClick={() => toggleFlag(project)}>
          <Icon icon={project.flaggedAt ? 'flag-off' : 'flag'} size="s" />
        </Button>
      ) as HTMLElement;
      button.title = label;
      button.setAttribute('aria-label', label);
      return button;
    };

    const columns: TableColumn<AdminProject>[] = [
      { label: '', width: '72px', render: (p) => <ProjectImage project={p} /> },
      {
        label: 'Name',
        sortKey: 'name',
        render: (p) => p.name || 'Untitled Project',
      },
      {
        label: 'Author',
        sortKey: 'author',
        width: '15%',
        render: (p) => p.authorName,
      },
      {
        label: 'Updated',
        sortKey: 'updated',
        width: '190px',
        render: (p) => <DateView date={p.updatedAt} variant="short" />,
      },
      {
        label: 'Status',
        sortKey: 'flagged',
        width: '100px',
        render: (p) =>
          p.flaggedAt ? <span class="flagged">Flagged</span> : 'Active',
      },
      {
        label: '',
        width: '110px',
        render: (p) => (
          <div class="row-actions">
            <Button
              variant="text"
              size="s"
              onClick={() => this.props.onRun(p.id)}>
              Run
            </Button>
            {flagButton(p)}
          </div>
        ),
      },
    ];

    this.onMount = load;

    return () => {
      const current = data();
      const n = notice();

      return (
        <div class="list">
          {n ? (
            <InfoBox variant={n.variant} title={n.title}>
              {n.text}
            </InfoBox>
          ) : null}

          <div class="table">
            <Table
              columns={columns}
              rows={current?.items ?? []}
              css={TableCellStyles}
              sort={sort()}
              onSortChange={(next) => {
                setSort(next, false);
                setPage(0, false);
                load();
              }}
              loading={loading()}
              emptyMessage="No projects yet"
            />
          </div>

          <TablePagination
            count={current?.total ?? 0}
            page={page()}
            rowsPerPage={rowsPerPage()}
            rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
            disabled={loading()}
            onPageChange={(next) => {
              setPage(next, false);
              load();
            }}
            onRowsPerPageChange={(size) => {
              setRowsPerPage(size, false);
              setPage(0, false);
              load();
            }}
          />
        </div>
      );
    };
  }

  getStyle() {
    return StyledProjectList;
  }
}

const StyledProjectList = cssStylesheet(css`
  :host {
    display: block;
    height: 100%;
  }

  .list {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  x-table-pagination {
    flex: none;
  }

  x-info-box {
    display: block;
    margin: 0 0 ${theme.space.m} 0;
  }

  .table {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
`);

// Cells render inside the Table's shadow root, so their rules go in through its css prop.
const TableCellStyles = css`
  x-project-image {
    width: 56px;
    aspect-ratio: 16 / 9;
    border-radius: 2px;
  }

  .flagged {
    color: ${theme.colors.error500};
    font-weight: 500;
  }

  .row-actions {
    display: flex;
    gap: ${theme.space.xs};
    justify-content: flex-end;
  }
`;
