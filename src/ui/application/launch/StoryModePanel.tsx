import {
  Component,
  InfoBox,
  Loading,
  register,
  theme,
  Typography,
} from 'rewild-ui';
import { getPublicGame, PublicGame } from '../../../api/public-game';
import { ProjectImage } from '../common/ProjectImage';

type Props = {
  /** Called once loaded with the project Start should play, or null when there is none. */
  onSelect: (projectId: string | null) => void;
};

/** The Story Mode tab: the promoted project. */
@register('x-story-mode-panel')
export class StoryModePanel extends Component<Props> {
  init() {
    const [loading, setLoading] = this.useState(true);
    const [game, setGame] = this.useState<PublicGame | null>(null);
    const [error, setError] = this.useState<string | null>(null);

    this.onMount = async () => {
      try {
        setGame(await getPublicGame(), false);
      } catch (err: any) {
        setError(err.message, false);
      }
      this.props.onSelect(game()?.id ?? null);
      setLoading(false);
    };

    return () => {
      if (loading()) return <Loading />;

      const current = game();
      const err = error();

      return (
        <div class="story">
          {err ? (
            <InfoBox variant="error" title="Could not load Story Mode">
              {err}
            </InfoBox>
          ) : null}
          <ProjectImage project={current ?? { id: '', imageUrl: null }} />
          <div class="details">
            <Typography variant="h3">
              {current ? current.name : 'No story yet'}
            </Typography>
            <Typography variant="body1">
              {current
                ? current.description
                : 'Story Mode is not available yet. Check back soon.'}
            </Typography>
          </div>
        </div>
      );
    };
  }

  getStyle() {
    return StyledStoryModePanel;
  }
}

const StyledStoryModePanel = cssStylesheet(css`
  :host {
    display: block;
    height: 100%;
  }

  .story {
    display: flex;
    flex-direction: column;
    gap: ${theme.space.l};
    height: 100%;
  }

  x-info-box {
    display: block;
  }

  x-project-image {
    width: 100%;
    aspect-ratio: 16 / 9;
    max-height: 50vh;
    border-radius: ${theme.sizes.radius};
  }

  .details {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .details x-typography {
    display: block;
    margin: 0 0 ${theme.space.s} 0;
  }
`);
