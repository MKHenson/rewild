import { IProject } from 'models';
import { Component, Icon, register, theme } from 'rewild-ui';
import { db } from 'src/database/database';

interface Props {
  project: Pick<IProject, 'id' | 'imageUrl'>;
}

/** A project's image, from `db.getProjectImage`, or a placeholder while it loads or when there is none. Fills its host. */
@register('x-project-image')
export class ProjectImage extends Component<Props> {
  init() {
    const [src, setSrc] = this.useState<string | null>(null);
    let loadedFor: string | undefined;

    const release = () => {
      const url = src();
      if (url) URL.revokeObjectURL(url);
    };

    const load = async (key: string) => {
      loadedFor = key;
      release();
      setSrc(null, false);
      const image = await db.getProjectImage(this.props.project);
      if (loadedFor === key && image) setSrc(URL.createObjectURL(image));
    };

    this.onCleanup = () => {
      release();
      setSrc(null, false);
      loadedFor = undefined;
    };

    return () => {
      const { project } = this.props;
      const key = `${project.id}|${project.imageUrl ?? ''}`;
      if (key !== loadedFor) load(key);

      const url = src();
      return url ? (
        <img src={url} alt="" />
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
