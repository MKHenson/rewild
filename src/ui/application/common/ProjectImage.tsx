import { IProject } from 'models';
import { Component, Icon, register, theme } from 'rewild-ui';
import { db } from 'src/database/database';

interface Props {
  project: Pick<IProject, 'id' | 'imageUrl'>;
}

/** A project's image: one picked on this device and not yet uploaded, the uploaded one, or a placeholder. Fills its host. */
@register('x-project-image')
export class ProjectImage extends Component<Props> {
  init() {
    const [pendingUrl, setPendingUrl] = this.useState<string | null>(null);
    let loadedFor: string | undefined;

    const release = () => {
      const url = pendingUrl();
      if (url) URL.revokeObjectURL(url);
    };

    const load = async (projectId: string | undefined) => {
      loadedFor = projectId;
      release();
      setPendingUrl(null, false);
      if (!projectId) return;
      const file = await db.getPendingProjectImage(projectId);
      if (file && loadedFor === projectId) setPendingUrl(URL.createObjectURL(file));
    };

    this.onCleanup = release;

    return () => {
      const { project } = this.props;
      if (project.id !== loadedFor) load(project.id);

      const src = pendingUrl() ?? project.imageUrl;
      return src ? (
        <img src={src} alt="" />
      ) : (
        <div class="placeholder">
          <Icon icon="mountain" />
        </div>
      );
    };
  }

  getStyle() {
    return StyledProjectImage;
  }
}

const StyledProjectImage = cssStylesheet(css`
  :host {
    display: block;
    overflow: hidden;
  }

  img,
  .placeholder {
    display: block;
    width: 100%;
    height: 100%;
  }

  img {
    object-fit: cover;
  }

  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    border: 1px dashed ${theme.colors.onSurfaceBorder};
    color: ${theme.colors.onSurfaceLight};
  }
`);
