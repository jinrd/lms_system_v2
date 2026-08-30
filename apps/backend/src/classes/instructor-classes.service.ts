import { Injectable } from '@nestjs/common';
import { ClassStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

export type InstructorClassResponse = {
  id: string;
  courseOfferingId: string;
  courseOfferingName: string;
  name: string;
  room: string | null;
  startDate: string;
  endDate: string;
  status: ClassStatus;
  subjectCount: number;
  assignment: {
    assignedFrom: string;
    assignedTo: string | null;
    current: boolean;
  };
};

@Injectable()
export class InstructorClassesService {
  constructor(private readonly prisma: PrismaService) {}

  async findMyClasses(
    instructorId: string,
  ): Promise<InstructorClassResponse[]> {
    const classes = await this.prisma.class.findMany({
      where: {
        instructorAssignments: {
          some: {
            instructorId,
          },
        },
      },
      include: {
        courseOffering: {
          select: {
            name: true,
          },
        },
        instructorAssignments: {
          where: {
            instructorId,
          },
          orderBy: {
            assignedFrom: 'desc',
          },
        },
        _count: {
          select: {
            classSubjects: true,
          },
        },
      },
      orderBy: [
        {
          startDate: 'desc',
        },
        {
          name: 'asc',
        },
      ],
    });

    return classes.flatMap((classItem) => {
      const assignment = classItem.instructorAssignments[0];

      if (!assignment) {
        return [];
      }

      return [
        {
          id: classItem.id,
          courseOfferingId: classItem.courseOfferingId,
          courseOfferingName: classItem.courseOffering.name,
          name: classItem.name,
          room: classItem.room,
          startDate: this.toDateString(classItem.startDate),
          endDate: this.toDateString(classItem.endDate),
          status: classItem.status,
          subjectCount: classItem._count.classSubjects,
          assignment: {
            assignedFrom: this.toDateString(assignment.assignedFrom),
            assignedTo: assignment.assignedTo
              ? this.toDateString(assignment.assignedTo)
              : null,
            current: assignment.assignedTo === null,
          },
        },
      ];
    });
  }

  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
