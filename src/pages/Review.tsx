import { useNavigate, useParams } from 'react-router-dom';
import ReviewWorkbench from '@/components/ReviewWorkbench';

export default function ReviewPage() {
  const navigate = useNavigate();
  const { id } = useParams();

  return (
    <ReviewWorkbench
      onBack={() => navigate('/')}
      initialReviewId={id}
    />
  );
}
